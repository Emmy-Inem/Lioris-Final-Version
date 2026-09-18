# Retention and deletion

Authoritative values: `RETENTION` in `src/constants/legal.ts` (also shown in the Privacy Policy). Update the constant first.

## Retention schedule

| Data | Retention | Mechanism | Status |
| --- | --- | --- | --- |
| Account, profile, user content | Until account deletion | User-initiated delete | Implemented via `delete-my-account` |
| Chat messages | Until account (or conversation) deletion | Cascade on account deletion | Implemented via `delete-my-account` (TODO(owner): verify all message tables are covered) |
| Verification documents | 30 days after decision; immediately on account deletion | Scheduled purge of storage objects and rows | TODO(owner): confirm a scheduled job (e.g. pg_cron + storage cleanup edge function) exists; not implemented by the client |
| Audit logs | 24 months | Scheduled delete of older rows | TODO(owner): confirm a scheduled job exists |
| AI Copilot prompts/images | Not stored by Lioris beyond the request; Google-side per its terms | - | TODO(owner): verify no logging in `gemini-proxy` |
| Deleted-account data | Purged immediately; backups roll off within 30 days | Edge function + Supabase backup rotation | TODO(owner): confirm the backup window on the Supabase plan |
| Support tickets / reports | Until account deletion | - | TODO(owner): decide whether moderation records must outlive the account (legal claims) |
| Data subject request log | TODO(owner) | - | - |

## Account deletion (right to erasure)

1. User opens Settings > Privacy & Data > Delete my account and types `DELETE` to confirm.
2. Client calls `deleteMyAccount()` (`src/api/profile.ts`) which invokes edge function `delete-my-account` with `{ confirm: 'DELETE' }` as the signed-in user.
3. The function deletes the user's storage files, database rows and the auth login. Server-side rules (for example the last-admin protection) return an error, which is shown to the user verbatim.
4. On success the client clears local tokens (`clearTokens`), signs out and returns to the login screen.
5. Backups roll off within 30 days; restoring a backup must not resurrect deleted accounts (re-run erasures after any restore - keep a deletion log with user IDs and timestamps only). TODO(owner): document the restore procedure.

## Data export (access and portability)

Settings > Privacy & Data > Export my data calls RPC `export_my_data` (returns JSON of the caller's data). On web the JSON downloads as `lioris-data-export-<date>.json`; on native it is written to the cache directory and shared through the system share sheet. The export must cover every table holding the user's personal data; re-check whenever a new table is added.

## Operational rules

* Respond to data subject requests within 30 days (`DSR_RESPONSE_DAYS`); verify identity before disclosing.
* Legal holds: if the law or a pending claim requires retention, keep only what is necessary and record it.
* Admin-initiated deletion (`admin-delete-user`) follows the same erasure scope.
