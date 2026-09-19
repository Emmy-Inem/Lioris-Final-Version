-- Push notification hook: every INSERT on public.notifications calls the `send-push` edge function.
--
-- APPLIED TO PRODUCTION on 2026-09-19 (project fdtnbluslkabwsmspbem). Kept here so a staging or rebuilt
-- database can be reproduced. It replaces the dashboard "Database Webhook" step in
-- docs/operations/push-notifications.md: a plain trigger + pg_net + Supabase Vault does the same job
-- and keeps the shared secret out of the trigger definition.
--
-- BEFORE running this on a new database:
--   1. Deploy the function:  supabase functions deploy send-push --no-verify-jwt
--   2. Pick one random value (>= 16 chars, e.g. `openssl rand -hex 32`) and store it in BOTH places:
--        supabase secrets set PUSH_WEBHOOK_SECRET=<value>
--        select vault.create_secret('<value>', 'push_webhook_secret',
--                                   'Sent as x-webhook-secret to the send-push edge function');
--      (to rotate later: set the edge secret, then `select vault.update_secret(id, '<value>')` for
--       the row named push_webhook_secret; both must always match.)
--   3. Optional, for the verification-document purge job: also store CRON_SECRET in the vault as
--      `cron_secret`. It is used by a pg_cron job, which needs the pg_cron extension enabled first.
--
-- Safe to re-run. Nothing here contains a secret.

begin;

-- pg_net lets Postgres make asynchronous HTTP calls.
create extension if not exists pg_net;

create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_secret text;
begin
  if new.recipient_id is null then
    return new;
  end if;

  -- Read the shared secret at call time; if it is not configured, do nothing (fail closed).
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret'
   limit 1;
  if v_secret is null then
    return new;
  end if;

  -- net.http_post only enqueues the request (asynchronous), so this adds no latency to the INSERT.
  perform net.http_post(
    url := 'https://fdtnbluslkabwsmspbem.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'schema', 'public', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 3000
  );
  return new;
exception when others then
  -- A push problem must NEVER block or roll back creating the in-app notification.
  return new;
end
$fn$;

-- Trigger function: nobody needs EXECUTE for it to fire.
revoke all on function public.notify_push_on_notification() from public, anon, authenticated;

drop trigger if exists trg_notifications_send_push on public.notifications;
create trigger trg_notifications_send_push
  after insert on public.notifications
  for each row execute function public.notify_push_on_notification();

commit;
