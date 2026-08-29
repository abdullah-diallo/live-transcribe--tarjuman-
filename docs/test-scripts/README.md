# Test scripts — prod/end-to-end verification

Throwaway browser-automation harnesses for verifying the live app end-to-end —
driving a real Chrome the way a user would, then asserting behavior. They are
**reference/manual tools**, not part of the unit suite (`npm test`).

## Prerequisites

`puppeteer-core` is intentionally **not** a tracked dependency (it pulls in a
lot for a tool we only run by hand). Install it on demand, and make sure you
have a Chrome/Chromium binary:

```bash
npm i -D puppeteer-core      # one-time; safe to uninstall after
```

These drive your **system Chrome** (no Chromium download). Default path is
macOS; override with `CHROME_PATH` elsewhere.

## Shared environment variables

| Var               | Default                                  | Meaning                              |
| ----------------- | ---------------------------------------- | ------------------------------------ |
| `TARJUMAN_ORIGIN` | `https://tarjuman.live`                  | Target site — point at localhost too |
| `CHROME_PATH`     | macOS Google Chrome                      | Chrome/Chromium executable           |
| `OUT_DIR`         | current directory                        | Where screenshots are written        |
| `KEEP_ACCOUNT=1`  | (unset)                                  | `verify-prod`: skip self-cleanup     |

## `verify-prod.mjs` — billing-gate smoke test

Signs up a **brand-new throwaway account** and asserts the recording flow is
reachable with the expected billing state, then deletes that account.

The discriminator is the free-tier gate driven by `BILLING_ENABLED` in
`convex/billingLimits.ts`:

- **`BILLING_ENABLED = false`** (current): every user is unlimited. Settings →
  Subscription reads **"Free · All features unlocked"**; `/record` has **no**
  "x of N sessions" meter and **no** "Monthly limit reached" wall. → **PASS**
- **`BILLING_ENABLED = true`**: a fresh free account shows **"0 of 4 sessions …"**
  and the usage meter; the wall appears once the cap is hit. → this script
  **FAILS** (by design — it asserts the gate is off).

A fresh account distinguishes the two builds without having to burn the cap.

```bash
node docs/test-scripts/verify-prod.mjs
# against local dev:
TARJUMAN_ORIGIN=http://localhost:3000 node docs/test-scripts/verify-prod.mjs
```

Writes `prod_record.png` + `prod_settings.png` to `OUT_DIR`. Exit `0` = PASS.

> Context: a real test session once burned the 4 free credits and the app
> hard-walled recording behind a dead-end "Upgrade" checkout (billing is
> test-mode, pointed at dev). Run this after any billing change — and before
> flipping `BILLING_ENABLED` on for real (which also needs live Stripe keys + a
> prod webhook).

## `cleanup-account.mjs` — delete an account by credentials

Logs in, walks Settings → Danger Zone (`Delete account` → `Continue` →
`Delete forever`), and verifies deletion by a failed re-login. Handy if a manual
run left an account behind; doubles as a `deleteAccount` + login smoke test.

```bash
node docs/test-scripts/cleanup-account.mjs <email> <password>
```

Exit `0` = account confirmed deleted.

## Notes

- Credentials are passed as args/generated at runtime — **never hardcode real
  secrets here.** Test accounts use the `@tarjuman-test.dev` domain.
- Authenticated pages keep a live Convex/STT WebSocket open, so these
  scripts navigate with `domcontentloaded` + a fixed settle delay rather than
  `networkidle` (which never fires).
- Running `verify-prod.mjs` against prod creates and deletes a real user row.
  That's expected and self-cleaning; use `KEEP_ACCOUNT=1` only when debugging.
