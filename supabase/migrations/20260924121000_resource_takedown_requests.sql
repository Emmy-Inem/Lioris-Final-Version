-- Copyright notice-and-takedown for shared lecture notes and other resources.
--
-- Lecturers (or anyone acting for them) can ask for a resource to be removed. A request
-- from a rights holder / their agent hides the resource IMMEDIATELY (pending review), as a
-- notice-and-takedown process requires; an admin then upholds it (resource deleted) or
-- rejects it (resource restored). Every step is recorded here as the legal paper trail.

-- ---------------------------------------------------------------------------------------
-- 1. The request log
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_takedown_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id       uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  -- Snapshots, so the record survives the resource being deleted.
  resource_title    text NOT NULL,
  resource_course   text,
  resource_uploader uuid,
  resource_file_url text,
  reporter_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claim_type        text NOT NULL CHECK (claim_type IN
                      ('owner_removal', 'agent_removal', 'third_party_copyright', 'inappropriate', 'inaccurate')),
  claimant_name     text NOT NULL CHECK (char_length(claimant_name) BETWEEN 2 AND 120),
  claimant_email    text NOT NULL CHECK (char_length(claimant_email) BETWEEN 5 AND 254),
  claimant_role     text CHECK (claimant_role IS NULL OR char_length(claimant_role) <= 120),
  details           text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 2000),
  good_faith        boolean NOT NULL DEFAULT false,
  auto_hidden       boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'rejected')),
  admin_notes       text,
  reviewed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_takedown_status_created
  ON public.resource_takedown_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takedown_resource ON public.resource_takedown_requests (resource_id);
CREATE INDEX IF NOT EXISTS idx_takedown_reporter ON public.resource_takedown_requests (reporter_id, created_at DESC);

ALTER TABLE public.resource_takedown_requests ENABLE ROW LEVEL SECURITY;

-- Rows are only ever written by the functions below; people can read their own requests and
-- admins can read all of them. (Requests carry a claimant's contact details, so staff of a
-- single campus do not get access.)
DROP POLICY IF EXISTS "Takedown requests readable by reporter and admins" ON public.resource_takedown_requests;
CREATE POLICY "Takedown requests readable by reporter and admins"
  ON public.resource_takedown_requests FOR SELECT
  USING (reporter_id = auth.uid() OR public.auth_profile_role() = 'admin');

REVOKE INSERT, UPDATE, DELETE ON public.resource_takedown_requests FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. Resource flag + guards
-- ---------------------------------------------------------------------------------------
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS takedown_status text
  CHECK (takedown_status IS NULL OR takedown_status IN ('disabled', 'removed'));

-- The existing moderation trigger reverts is_approved for anyone who is not admin/staff (so a
-- student cannot approve their own upload). The takedown functions legitimately hide a resource
-- on behalf of a student reporter, so they set a transaction-local flag that the trigger honours.
CREATE OR REPLACE FUNCTION public.enforce_resource_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    DECLARE
      v_role text;
    BEGIN
      IF auth.uid() IS NULL THEN
        RETURN NEW;                      -- service_role / migrations
      END IF;
      IF current_setting('lioris.takedown_action', true) = 'on' THEN
        RETURN NEW;                      -- set only inside the takedown functions below
      END IF;
      SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
      IF v_role IN ('admin', 'staff') THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'INSERT' THEN
        NEW.is_approved := false;
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
      ELSE
        NEW.is_approved := OLD.is_approved;
        NEW.approved_by := OLD.approved_by;
        NEW.approved_at := OLD.approved_at;
      END IF;
      RETURN NEW;
    END
    $function$;

-- While a takedown is open nobody (staff included) can re-approve the resource by accident;
-- only resolve_takedown_request() can lift it.
CREATE OR REPLACE FUNCTION public.guard_resource_takedown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('lioris.takedown_action', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.takedown_status IS NULL THEN
    NEW.takedown_status := NULL;          -- only the takedown functions may start a takedown
  END IF;
  IF OLD.takedown_status IS NOT NULL THEN
    -- Keep the takedown marker and the hidden state exactly as they were.
    NEW.takedown_status := OLD.takedown_status;
    IF NEW.is_approved IS TRUE AND OLD.is_approved IS NOT TRUE THEN
      RAISE EXCEPTION 'This resource is under a copyright takedown review and cannot be approved.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_resource_takedown ON public.resources;
CREATE TRIGGER trg_guard_resource_takedown
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.guard_resource_takedown();

-- ---------------------------------------------------------------------------------------
-- 3. Submit a request
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_takedown_request(
  p_resource_id     uuid,
  p_claim_type      text,
  p_claimant_name   text,
  p_claimant_email  text,
  p_claimant_role   text,
  p_details         text,
  p_good_faith      boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_res         public.resources%ROWTYPE;
  v_name        text := btrim(coalesce(p_claimant_name, ''));
  v_email       text := btrim(coalesce(p_claimant_email, ''));
  v_details     text := btrim(coalesce(p_details, ''));
  v_rights_claim boolean := p_claim_type IN ('owner_removal', 'agent_removal');
  v_hide        boolean;
  v_id          uuid;
  v_admin       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to submit a request.' USING ERRCODE = '28000';
  END IF;
  IF p_claim_type NOT IN ('owner_removal', 'agent_removal', 'third_party_copyright', 'inappropriate', 'inaccurate') THEN
    RAISE EXCEPTION 'Unknown request type.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name.' USING ERRCODE = '22023';
  END IF;
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'Please enter a valid contact email address.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_details) < 10 OR char_length(v_details) > 2000 THEN
    RAISE EXCEPTION 'Please describe your request in 10 to 2000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_claim_type IN ('owner_removal', 'agent_removal', 'third_party_copyright') AND p_good_faith IS NOT TRUE THEN
    RAISE EXCEPTION 'You must confirm the statement before submitting a copyright request.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_res FROM public.resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That resource no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF (SELECT count(*) FROM public.resource_takedown_requests
        WHERE reporter_id = v_uid AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'You have sent too many requests today. Please try again tomorrow.' USING ERRCODE = '54000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resource_takedown_requests
              WHERE reporter_id = v_uid AND resource_id = p_resource_id AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a request open for this resource.' USING ERRCODE = '23505';
  END IF;

  -- Only a rights holder (or their agent) can pull something offline on the spot.
  v_hide := v_rights_claim AND p_good_faith IS TRUE;

  INSERT INTO public.resource_takedown_requests
    (resource_id, resource_title, resource_course, resource_uploader, resource_file_url, reporter_id,
     claim_type, claimant_name, claimant_email, claimant_role, details, good_faith, auto_hidden)
  VALUES
    (v_res.id, v_res.title, v_res.course_code, v_res.uploader_id, v_res.file_url, v_uid,
     p_claim_type, v_name, v_email, nullif(btrim(coalesce(p_claimant_role, '')), ''), v_details,
     coalesce(p_good_faith, false), v_hide)
  RETURNING id INTO v_id;

  IF v_hide THEN
    PERFORM set_config('lioris.takedown_action', 'on', true);
    UPDATE public.resources
       SET is_approved = false, takedown_status = 'disabled'
     WHERE id = v_res.id;
    PERFORM set_config('lioris.takedown_action', 'off', true);

    IF v_res.uploader_id IS NOT NULL AND v_res.uploader_id <> v_uid THEN
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
      VALUES (v_res.uploader_id, NULL, 'Your resource was taken offline',
              '"' || v_res.title || '" was taken offline after a rights-holder request while it is reviewed. '
              || 'If you believe this is a mistake, contact us through the Support Desk (Settings → Support).',
              'system', '/notifications', false);
    END IF;
  END IF;

  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND coalesce(is_suspended, false) = false LOOP
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_admin, v_uid,
            CASE WHEN v_hide THEN 'Copyright takedown: resource hidden' ELSE 'New resource report' END,
            '"' || v_res.title || '" - ' || replace(p_claim_type, '_', ' ') || '. Review it in Takedown Requests.',
            'system', '/notifications', false);
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'auto_hidden', v_hide);
END
$$;

REVOKE ALL ON FUNCTION public.submit_takedown_request(uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_takedown_request(uuid, text, text, text, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 4. Admin decision
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_takedown_request(
  p_request_id uuid,
  p_decision   text,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_req  public.resource_takedown_requests%ROWTYPE;
  v_path text;
BEGIN
  IF v_uid IS NULL OR public.auth_profile_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an administrator can decide a takedown request.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('uphold', 'reject') THEN
    RAISE EXCEPTION 'Decision must be uphold or reject.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.resource_takedown_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided.' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('lioris.takedown_action', 'on', true);

  IF p_decision = 'uphold' THEN
    -- Storage path inside the private "resources" bucket, for the caller to delete the file too.
    v_path := substring(v_req.resource_file_url FROM '/resources/([^?]+)');
    IF v_req.resource_id IS NOT NULL THEN
      DELETE FROM public.resources WHERE id = v_req.resource_id;
    END IF;
    UPDATE public.resource_takedown_requests
       SET status = 'upheld', admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
           reviewed_by = v_uid, reviewed_at = now()
     WHERE id = v_req.id;
  ELSE
    IF v_req.resource_id IS NOT NULL THEN
      UPDATE public.resources
         SET takedown_status = NULL,
             is_approved = CASE WHEN v_req.auto_hidden THEN true ELSE is_approved END
       WHERE id = v_req.resource_id AND takedown_status IS NOT NULL;
    END IF;
    UPDATE public.resource_takedown_requests
       SET status = 'rejected', admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
           reviewed_by = v_uid, reviewed_at = now()
     WHERE id = v_req.id;
  END IF;

  PERFORM set_config('lioris.takedown_action', 'off', true);

  IF v_req.reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_req.reporter_id, v_uid,
            CASE WHEN p_decision = 'uphold' THEN 'Your request was upheld' ELSE 'Your request was reviewed' END,
            CASE WHEN p_decision = 'uphold'
                 THEN '"' || v_req.resource_title || '" has been removed from Lioris.'
                 ELSE 'We reviewed your request about "' || v_req.resource_title || '" and kept it available. Contact the Support Desk if you want to discuss this.' END,
            'system', '/notifications', false);
  END IF;
  IF p_decision = 'reject' AND v_req.auto_hidden AND v_req.resource_uploader IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_req.resource_uploader, NULL, 'Your resource is back online',
            '"' || v_req.resource_title || '" was reviewed and has been restored.', 'system', '/notifications', false);
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_decision = 'uphold' THEN 'upheld' ELSE 'rejected' END,
                            'file_path', v_path);
END
$$;

REVOKE ALL ON FUNCTION public.resolve_takedown_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_takedown_request(uuid, text, text) TO authenticated;
