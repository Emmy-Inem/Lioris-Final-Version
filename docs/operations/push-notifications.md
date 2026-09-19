# Push notifications (Expo Push + send-push edge function)

## How it works

```
app INSERTs a row into public.notifications          (one row per recipient; broadcasts insert N rows)
   -> Database Webhook (INSERT on public.notifications)
   -> Edge Function send-push  (verify_jwt OFF, header x-webhook-secret)
   -> reads the recipient's devices from public.push_tokens (service role)
   -> POST https://exp.host/--/api/v2/push/send  (batches of <= 100)
   -> Expo -> FCM (Android) / APNs (iOS) -> device
   -> tap => app reads data.deepLinkPath and calls router.push()
```

- Tokens are registered by `src/notifications/push.ts` -> `registerDevicePushToken()` (`src/api/notifications.ts`), which upserts into `public.push_tokens` (unique `token`, owner-only RLS). The old `profiles.push_token` column is no longer written.
- `send-push` skips: suspended recipients, recipients who blocked the sender, rows older than 10 minutes, tokens that are not valid `ExponentPushToken[...]` strings. A `DeviceNotRegistered` ticket error deletes that `push_tokens` row.
- Android channel: `critical` for `type = 'system_announcement'` (and `emergency`), otherwise `default`. Both channels are created on the device by `registerForPushNotificationsAsync()`.
- `notifications.action_url` becomes `data.deepLinkPath`. Only in-app absolute paths (`/...`) are forwarded.
- Message titles/bodies are truncated (100 / 178 characters) and are never logged.
- There is currently no per-user "notifications off" column in the schema, so nothing is skipped for that reason. If one is added later, filter on it in `send-push`.

## 1. Prerequisites

1. `supabase_launch_hardening_2026.sql` has been applied (creates `public.push_tokens`).
2. Secrets are set (values are never printed by the tooling):

   ```bash
   supabase secrets set PUSH_WEBHOOK_SECRET=$(openssl rand -hex 32)   # >= 16 chars; remember it for step 3
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>  # already set for the other functions
   # optional, only if you enable "Enhanced Push Security" in the Expo dashboard:
   supabase secrets set EXPO_ACCESS_TOKEN=<Expo access token>
   ```

   Without `PUSH_WEBHOOK_SECRET` the function fails closed (HTTP 500) and sends nothing.
3. Deploy (JWT verification must be OFF because the webhook is not a signed-in user):

   ```bash
   supabase functions deploy send-push --no-verify-jwt
   ```

   or run `scripts/deploy-supabase.sh` / `scripts/deploy-supabase.ps1`.

## 2. Create the Database Webhook

> **Production status (2026-09-19): DONE, do not create the dashboard webhook.** Production uses a trigger
> instead (`trg_notifications_send_push` -> `public.notify_push_on_notification()` -> `pg_net` -> `send-push`),
> with the shared secret kept in Supabase Vault as `push_webhook_secret`. The exact SQL is in
> `supabase_push_webhook_2026.sql` (secret-free; its header explains the one-time secret setup for a new
> database). Creating the dashboard hook as well would send every push **twice**.
> To rotate the secret: `supabase secrets set PUSH_WEBHOOK_SECRET=<new>` and
> `select vault.update_secret(id, '<new>') from vault.secrets where name = 'push_webhook_secret';`.
> To disable pushes: `alter table public.notifications disable trigger trg_notifications_send_push;`.
>
> The dashboard steps below remain valid for a project that does not use the trigger.

1. Open the project -> **Database** -> **Webhooks** (enable Webhooks if prompted) -> **Create a new hook**.
2. **Name**: `send-push-on-notification`
3. **Table**: `public.notifications`
4. **Events**: tick **Insert** only.
5. **Type of hook**: **HTTP Request**.
6. **Method**: `POST`
7. **URL**: `https://fdtnbluslkabwsmspbem.supabase.co/functions/v1/send-push`
8. **HTTP Headers** (remove any default you do not need):
   - `Content-Type: application/json`
   - `x-webhook-secret: <the exact PUSH_WEBHOOK_SECRET value>`
9. **Timeout**: 5000 ms (the default is fine). **Confirm**.

The secret lives in the hook definition; treat the hook configuration as sensitive and rotate both together (`supabase secrets set PUSH_WEBHOOK_SECRET=...` and edit the header).

## 3. Expo / FCM / APNs credentials

Expo Go cannot receive remote pushes on Android (SDK 53+); use an EAS development or production build.

### Android (FCM V1)

1. Firebase console -> create/select a project -> **Add app** -> Android, package name `app.lioris.mobile`. Download `google-services.json` and keep it out of git (add the path to `.gitignore`); reference it from `app.config.ts` as `android.googleServicesFile` (or provide it as an EAS file secret).
2. Firebase console -> **Project settings** -> **Service accounts** -> **Generate new private key** (a JSON file; do not commit it).
3. Upload the key to Expo: `eas credentials` -> **Android** -> the build profile (e.g. `production`) -> **Google Service Account** -> **Manage your Google Service Account Key for Push Notifications (FCM V1)** -> **Set up a Google Service Account Key for Push Notifications** -> choose the JSON file.
4. Rebuild the app (`eas build -p android --profile production`); credentials are baked in at build time via `google-services.json`.

### iOS (APNs)

1. Requires an Apple Developer Program membership and bundle id `app.lioris.mobile`.
2. `eas credentials` -> **iOS** -> the build profile -> **Push Notifications: Manage your Apple Push Notifications service key** -> let EAS create/upload a key (it handles the Apple sign-in interactively).
3. Rebuild (`eas build -p ios --profile production`). Push does not work on the iOS simulator; test on a physical device.

The Expo `projectId` is read from `app.config.ts` (`extra.eas.projectId`, overridable with `EAS_PROJECT_ID`). `getExpoPushTokenAsync` needs it, so keep it correct.

## 4. Test

Register a device: install the EAS build on a physical phone, sign in, accept the notification permission prompt. Confirm a row appears in `public.push_tokens` (SQL editor: `select user_id, platform, updated_at from public.push_tokens;`; the token itself is a credential, do not paste it into tickets).

**Test the function directly** (replace the placeholders; `created_at` must be recent because rows older than 10 minutes are ignored):

```bash
SECRET='<PUSH_WEBHOOK_SECRET>'
curl -i -X POST 'https://fdtnbluslkabwsmspbem.supabase.co/functions/v1/send-push' \
  -H "x-webhook-secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"type":"INSERT","table":"notifications","schema":"public","record":{"recipient_id":"<USER_UUID>","title":"Test","body":"Hello from send-push","type":"system","action_url":"/","created_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}}'
```

Expected responses:

| Response | Meaning |
| --- | --- |
| `200 {"success":true,"sent":1,"removed":0}` | Accepted by Expo for 1 device |
| `200 {"success":true,"sent":0,"skipped":"no_tokens"}` | Recipient has no registered device |
| `200 ... "skipped":"stale" / "suspended" / "blocked"` | Filtered as designed |
| `401` | Wrong or missing `x-webhook-secret` |
| `500 Server misconfiguration` | `PUSH_WEBHOOK_SECRET` (min 16 chars) or `SUPABASE_SERVICE_ROLE_KEY` not set |

**Test end to end**: insert a row in the SQL editor (or use the in-app "announcement"/"message" flows) and watch the phone:

```sql
insert into public.notifications (recipient_id, title, body, type, action_url)
values ('<USER_UUID>', 'Test', 'End-to-end push', 'system', '/');
```

If nothing arrives: Dashboard -> **Edge Functions** -> `send-push` -> **Logs**; Database -> Webhooks -> the hook's request log (or `net._http_response`); and the Expo push tool at <https://expo.dev/notifications> to send to the same token manually (isolates FCM/APNs credential problems from function problems).

## 5. Limits and known gaps

- **Expo limits**: 600 notifications/second per project; 100 messages per request (the function batches to 100); messages are truncated at ~4 KB total payload. Titles/bodies here are capped to 100/178 characters.
- **Broadcasts**: an "all users" announcement inserts one row per user, which triggers one webhook call (one function invocation) per row. Supabase Edge Functions and `pg_net` handle bursts, but very large campuses (tens of thousands of users) may hit concurrency limits; if delivery of a big broadcast is partial, batch broadcast sends or move to a queue. Rows older than 10 minutes are intentionally never pushed, so a late webhook retry cannot re-notify.
- **Receipts**: only the immediate ticket result is processed (which catches most `DeviceNotRegistered` cases). Delayed receipts (Expo `getReceipts`, available ~15 minutes later) are not polled; stale tokens that only surface there are removed the next time Expo returns the error on a ticket, or when the user signs out (`unregisterDevicePushToken`).
- **Logout**: `unregisterDevicePushToken()` (`src/api/notifications.ts`) deletes this device's token. It must run before `supabase.auth.signOut()`; wire it into the logout flow (`src/api/auth.ts` `logout()`), otherwise a signed-out shared device keeps receiving the previous user's pushes until the token is re-registered by the next user (the unique-token upsert re-parents it automatically on next login).
- **At-most-once**: the webhook is fire-and-forget; if the function or Expo is down the push is dropped (the in-app notification row still exists).
- Web sessions do not receive OS pushes (Expo push tokens are native only).
