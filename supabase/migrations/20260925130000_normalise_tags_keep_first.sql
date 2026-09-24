-- normalise_tags: when the same tag is typed twice with different capitals ("Software Engineering",
-- "software engineering"), keep the FIRST one the person typed and keep the order they typed them in.
-- (The first version sorted the duplicates and so kept whichever the database collation liked best.)
CREATE OR REPLACE FUNCTION public.normalise_tags(p_tags text[], p_max_len integer DEFAULT 40)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(x ORDER BY ord), '{}')
  FROM (
    SELECT DISTINCT ON (lower(x)) x, ord
    FROM (
      SELECT left(btrim(e), p_max_len) AS x, ord
      FROM unnest(COALESCE(p_tags, '{}')) WITH ORDINALITY AS t(e, ord)
    ) a
    WHERE x <> ''
    ORDER BY lower(x), ord
  ) b;
$$;
