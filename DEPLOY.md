# Deploy LiveTranscribe to Fly.io

This is the canonical deploy guide. Vercel cannot host this app because the
Deepgram WebSocket proxy in `server.js` requires a persistent Node process
(Vercel is serverless). Fly.io runs Docker containers and supports
WebSockets natively.

## One-time setup

### 1. Install the Fly CLI
```bash
brew install flyctl
fly auth signup        # or `fly auth login` if you already have an account
```

Free tier covers 3 small machines, enough to run the dev + prod
deployment with room to spare.

### 2. Create the Fly app
From the project root:
```bash
fly launch --no-deploy --copy-config
```

`--copy-config` tells Fly to use the `fly.toml` already in this repo
(region: Bahrain, 512MB, shared CPU). When prompted:
- App name: `livetranscribe` (or pick your own — must be globally unique)
- Skip Postgres / Redis (we use Convex for DB)
- DO confirm the deploy region is `fra` (Frankfurt) — Fly has no Gulf data center, Frankfurt has the best latency for KSA users

This creates the Fly app + a Fly volume (none — we don't need persistent disk).

### 3. Set runtime secrets
Server-side secrets (NOT inlined into the client bundle):
```bash
fly secrets set \
  DEEPGRAM_API_KEY='your-deepgram-key' \
  ANTHROPIC_API_KEY='sk-ant-api03-...' \
  LOOPS_API_KEY='loops_...' \
  LOOPS_PASSWORD_RESET_ID='your-loops-template-id'
```

These are stored encrypted by Fly and injected as env vars at container
startup. Update them anytime with `fly secrets set KEY=value`.

### 4. Deploy

The first deploy needs to inline the public env vars (Convex URL etc.)
into the client bundle at build time:

```bash
fly deploy \
  --build-arg NEXT_PUBLIC_CONVEX_URL='https://ardent-mockingbird-866.convex.cloud' \
  --build-arg NEXT_PUBLIC_CONVEX_SITE_URL='https://ardent-mockingbird-866.convex.site' \
  --build-arg NEXT_PUBLIC_SENTRY_DSN='your-sentry-dsn-or-empty' \
  --build-arg NEXT_PUBLIC_APP_URL='https://livetranscribe.fly.dev'
```

Replace `livetranscribe.fly.dev` with your actual Fly app URL once Fly
assigns it (printed after `fly launch`). On the very first deploy you can
leave it as `https://<app-name>.fly.dev`; you'll only know the canonical
URL after deployment, and a redeploy with the right value is fine.

After deploy:
```bash
fly status                # check the machine is healthy
fly logs                  # tail logs in real time
fly open                  # open the deployed app in your browser
```

### 5. Update Google OAuth redirect URI

Now that the app has a public URL, add the Fly URL to your Google OAuth
client's "Authorized redirect URIs" list:

```
https://ardent-mockingbird-866.convex.site/api/auth/callback/google
```

(That stays the same regardless of where Next is hosted, because Convex
Auth handles the OAuth callback on the Convex side. Same for the
authorized JS origins — add `https://livetranscribe.fly.dev` there.)

### 6. Verify

Open the deployed URL and try:
- [ ] Sign up with email + password → land on `/record`
- [ ] Sign in with Google → land on `/record`
- [ ] Tap record → grant mic → speak Arabic → see transcript + translation
- [ ] Stop → Generate Summary → summary appears
- [ ] History tab shows the session
- [ ] Tap session → detail page loads with transcript + summary
- [ ] Sign out → Sign back in → history persists
- [ ] Sign out → Forgot password → check email arrives via Loops → reset
- [ ] Account menu → Delete account → all sessions removed
- [ ] `/privacy` and `/terms` reachable without auth
- [ ] Hit `/api/translate` from curl with no auth → 401 (not 200)

## Subsequent deploys

After the initial deploy, the build args don't change. Just:
```bash
fly deploy
```
unless an env var changes (then re-run with the appropriate `--build-arg`).

## Custom domain

When you're ready (e.g. `livetranscribe.app`):
```bash
fly certs add livetranscribe.app
```

Then add a CNAME record at your DNS provider pointing `livetranscribe.app`
to `livetranscribe.fly.dev`. Fly auto-provisions a Let's Encrypt cert.

Update the build args on the next deploy:
```bash
fly deploy --build-arg NEXT_PUBLIC_APP_URL='https://livetranscribe.app' [...]
```

And add the new domain to Google OAuth's authorized origins/redirect URIs.

## Scaling

When the user base grows enough that cold starts hurt, set the floor:
```bash
fly scale count 1 --max-per-region 2
```

This keeps at least one machine always running and allows up to 2 in the
primary region during traffic spikes. Cost goes from $0/mo (free tier with
auto-stop) to ~$2-5/mo per always-on machine.

## Rollback

```bash
fly releases                    # list past releases
fly releases rollback <version> # roll back to a known-good build
```

## Health monitoring

Fly's dashboard shows CPU/memory/request graphs. For deeper visibility
once you have a Sentry DSN configured:
- Sentry captures any unhandled error from any route handler or React
  component. Drop the DSN into the build args above + redeploy.

## Env var reference

| Var | Where | Purpose |
|---|---|---|
| `DEEPGRAM_API_KEY` | Fly secret | Server uses for Deepgram WS auth + REST preflight |
| `ANTHROPIC_API_KEY` | Fly secret | `/api/translate` + `/api/summarize` upstream auth |
| `LOOPS_API_KEY` | Fly secret | Password-reset email sender |
| `LOOPS_PASSWORD_RESET_ID` | Fly secret | Loops transactional template ID |
| `NEXT_PUBLIC_CONVEX_URL` | Fly build arg | Client embeds this; Convex realtime endpoint |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Fly build arg | Convex HTTP actions endpoint (Auth callbacks) |
| `NEXT_PUBLIC_SENTRY_DSN` | Fly build arg (optional) | Empty = Sentry off; non-empty = enabled |
| `NEXT_PUBLIC_APP_URL` | Fly build arg | Used by sitemap, robots.txt |

Convex env vars (these live in Convex itself, set via `npx convex env set ...`):
| Var | Purpose |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | Convex Auth session signing — set automatically by `npx @convex-dev/auth` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth — required for Google sign-in |
| `LOOPS_API_KEY`, `LOOPS_PASSWORD_RESET_ID` | Same values as Fly secrets — Convex needs them too because `convex/passwordReset.ts` runs in Convex's runtime |

Note that `LOOPS_*` lives in BOTH Fly secrets and Convex env. The Fly value
isn't actually used (`convex/passwordReset.ts` runs server-side in Convex,
not in our Next process), but setting it as a Fly secret is harmless and
makes future refactors easier if password reset ever moves to a Next route.
