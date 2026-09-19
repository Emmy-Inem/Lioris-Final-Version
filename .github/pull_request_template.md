## Summary

<!-- What does this change and why? Link the issue if there is one. -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` and `npm test` pass
- [ ] `npm run e2e` (Playwright smoke + accessibility) passes locally or in CI
- [ ] **Migration applied?** N/A, or the SQL file is listed below and has been run in the Supabase SQL editor (staging first)
- [ ] **Secrets?** No keys, tokens or `.env` values are committed; new secrets are documented and set in Vercel / Supabase
- [ ] **Edge functions?** N/A, or the function name and its `--no-verify-jwt` / JWT setting are listed below
- [ ] **Rollback plan** is written below (how to undo this if it misbehaves in production)

## Migrations / functions / config

<!-- e.g. supabase_xxx_2026.sql, functions/report-client-error (verify_jwt=false), new env vars -->

## Rollback plan

<!-- e.g. revert this PR and redeploy on Vercel; run the down-SQL; disable the feature flag -->

## Screenshots / notes for reviewers

<!-- Optional -->
