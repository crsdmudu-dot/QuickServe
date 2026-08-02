# Native journey automation (Maestro)

Driver: **Maestro** (`maestro.bat` is the Windows launcher; on macOS/CI use the `maestro`
binary on PATH). Flows in `flows/` are platform-independent (semantic text selectors) and
credentials are passed via Maestro `-e` params — **never stored in flow files**.

- `backend.mjs` — QA Supabase REST helper (service role) for **setup-verification, the admin
  assignment prerequisite, and cleanup only**. Reads `qa/.env` locally, or `process.env`
  (CI secrets) when `qa/.env` is absent.
- `flows/entry-reachability.yaml` — cold-launch → customer/provider welcome (deterministic
  native entry; not the admin login).
- `flows/customer-journey.yaml` — customer sign-in → home → create a booking through the UI.
- `flows/provider-advance.yaml` — provider sign-in → open assigned job → tap one status
  button (`-e NEXT=...`); dismisses iOS/Android permission prompts.
- `flows/customer-review.yaml` — customer opens the completed booking → submits a review.
- `ios-journeys.sh` — orchestrates the full customer→assign→provider→review journey on a
  booted iOS simulator with backend verification + cleanup.

## Android (local, Windows)
Boot an emulator, install the preview APK, then run flows, e.g.:
```
qa\native\maestro.bat test qa\native\flows\entry-reachability.yaml
```

## iOS (GitHub Actions macOS runner — no local Mac/iPhone needed)
`.github/workflows/ios-native-journeys.yml` fetches the EAS **iOS simulator** build, boots a
simulator, installs the app, and runs `ios-journeys.sh`.

1. Build the simulator app once (no Apple signing needed):
   `eas build -p ios --profile ios-simulator`
2. Add repository secrets (Settings → Secrets and variables → Actions):
   `EXPO_TOKEN`, `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SERVICE_ROLE_KEY`,
   `QA_CUSTOMER_EMAIL`, `QA_CUSTOMER_PASSWORD`, `QA_PROVIDER1_EMAIL`, `QA_PROVIDER1_PASSWORD`.
3. Trigger from anywhere (the workflow must exist on the branch you dispatch):
   - Actions tab → "iOS Native Journeys" → Run workflow, **or**
   - `gh workflow run ios-native-journeys.yml --ref <branch>`
   Optional input `build_id` pins a specific EAS iOS build (blank = latest `ios-simulator`).

Note: hosted **macOS** minutes bill at a higher multiplier on private repos.
