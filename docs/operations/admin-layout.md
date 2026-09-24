# Admin area layout

The admin role has five groups. Each capability lives in exactly one of them; the bottom bar (phone) and the
sidebar (desktop) link to a group, and the pages inside a group are reached from the pills at the top of the
page (`src/components/admin/AdminSectionTabs.tsx`). The definition is `src/components/admin/adminNav.ts`.

| Group | Pages | What it is for |
| --- | --- | --- |
| **Overview** | `dashboard` | What needs attention now (ID verifications, reports, takedowns, tickets) and a card for each group. Read-only. |
| **People** | `user-directory` (Members), `verification-requests`, `support-desk` | Accounts: edit, suspend, verify, view-as (Support Mode), delete; ID verification; support tickets. |
| **Content** | `content-desk` (tabs: Threads & Communities, Events, Resources, Comments) | Everything members publish: create, edit, approve, pin, delete. |
| **Safety** | `moderation-queue` (Reports), `takedown-requests`, `audit-logs` | Community reports, copyright takedowns, the audit trail. |
| **Platform** | `platform-config` (Console), `feature-controls`, `super-admin-config` (Campuses & Security), `system-health` | Broadcasts, portal links, glass studio; feature switches; campuses, upload limits, maintenance mode; database health. |

Personal pages (Messages, Alerts, Saved, Settings, Profile) are reached from the header, not the groups. The role
switcher ("Preview as") lives only in Settings.

## Settings that are enforced

- **Maintenance mode** (`platform_settings.maintenance_mode`): `src/components/MaintenanceGate.tsx` shows signed-in
  non-admins a maintenance screen. It is a front-end gate and does not block database writes.
- **Upload limits** (`platform_settings.storage_quotas`): `src/api/platformSettings.ts` `assertWithinStorageQuota()`
  is called by resource, avatar and cover uploads.
- **Broadcast audience**: `createNotification({ campusCode })` limits the recipients to one campus.
