# Mobile releases: over-the-air (OTA) updates and store builds

The web app ships on every push to `main` (Vercel). The Android and iOS apps ship in two ways:

| What changed | How it reaches phones | How often |
| --- | --- | --- |
| JavaScript, screens, styles, copy, images, API calls | **OTA update** (Expo Updates), published automatically on every push to `main` | every push |
| Native code: a new/upgraded native module, a config plugin, permissions, package ids, the Expo SDK | **New store build** (EAS build, then Play Console / App Store Connect) | when needed |

Database migrations and edge functions are separate (`docs/security/deploy.md`); OTA only carries the JavaScript bundle.

## How OTA works here

- `expo-updates` is installed and configured in `app.config.ts` (`updates.url`, `runtimeVersion`, channel header).
- A store build is stamped with a **runtime version** (= `version` in `app.config.ts`, `runtimeVersion.policy: appVersion`)
  and asks the **`production`** channel for updates on launch (staging builds ask `preview`). The dev build
  (`APP_ENV=development`, `lioris.app.dev`) has updates switched off and loads JS from Metro.
- The channel `production` follows the branch `production` on the Expo project `@inem/lioris`.
- `.github/workflows/cd.yml` job **Publish OTA Update** runs after the web deploy succeeds. It re-runs typecheck and unit
  tests, runs the native runtime guard (below), then `eas update --branch production --environment production`.
  It needs the repository secrets `EXPO_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- An installed app checks for an update when it is opened, downloads it in the background and uses it from the next
  launch (so a phone usually needs two launches to show a fresh update).
- Only installs with the **same runtime version** get an update. That is the safety net: JavaScript is never sent to an
  app whose native code it was not written for.

**Apps built before expo-updates was added (every build made up to 25 Sep 2026) cannot receive OTA updates at all.** They
keep running the JavaScript they were built with until a new store build is installed. The first build made from this
code is therefore a one-off step that has to happen before any phone can get an OTA update.

## The native runtime guard

`native-runtime.json` records the native side of the current runtime version: every installed package that contains
native code (major.minor) and a signature of the native part of `app.config.ts`. `npm run native-runtime` (CI and the
OTA job) fails when the code drifts from that record:

- Native package added/removed/upgraded (major.minor), or plugin/permission/package-id change, **without** a new
  `version` -> red build: OTA is blocked, so a phone can never receive JavaScript that needs native code it does not have.
- Patch releases of native packages (Dependabot patch bumps) do not trip it.

To ship a native change:

1. Change the code and bump `version` in `app.config.ts` (for example `1.0.0` -> `1.1.0`).
2. Build and release new store apps (below).
3. `npm run native-runtime -- update`, commit `native-runtime.json`.

From then on OTA updates go to the new runtime version only. Phones still on the old version keep what they have and
should be nudged to update from the store.

## Releasing new store apps

Android (EAS counts the build number; the production profile signs with the local `credentials.json`, so run it on the
machine that has that file):

```bash
npx eas-cli build --platform android --profile production
```

Then upload the `.aab` to the Play Console (internal testing first, see `docs/launch/google-playstore-readiness.md`).
iOS: `npx eas-cli build --platform ios --profile production`, then submit to App Store Connect.

The GitHub workflow can also run these (Actions -> Continuous Deployment -> Run workflow -> `build` or
`build-and-submit`). Because the production profile uses `credentialsSource: local`, that only works once the signing
credentials live on EAS (`eas credentials`) instead of in a local file.

## Rolling back a bad update

```bash
npx eas-cli update:list --branch production --limit 5     # find the group id of the bad update
npx eas-cli update:rollback <group-id>                    # republishes the update before it (or the embedded build)
```

Phones pick the rollback up like any other update (next launch). A change that also needs a database rollback follows
`docs/launch/launch-checklist.md`.

## Checks

- `npx eas-cli channel:view production` shows the channel, its branch and the latest update.
- The commit message of each publish is `OTA <short sha>: <subject>`; the Expo dashboard shows the runtime version each
  update targets.
