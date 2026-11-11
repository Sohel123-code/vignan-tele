# Calling setup ? direct Outpero API

No ngrok or webhook is required. The Node backend sends calls through Outpero's v1 API and polls for status, summaries, captured answers, transcripts and recordings. The browser polls our backend every five seconds; it never receives the Outpero API key.

## Use the existing credentials

The backend reads the project root `.env`. Optional nonempty `server/.env` values override it; hosting environment values take precedence over both. The existing names are supported:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
SUPABASE_SECRET_KEY=YOUR_BACKEND_SUPABASE_KEY
OUTPERO_API_KEY=YOUR_OUTPERO_API_KEY
VITE_API_URL=http://localhost:4000
```

The server also accepts `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not put server credentials in a `VITE_*` variable. Keep secrets in ignored environment files or hosting settings.

Default provider endpoint: `https://api.outpero.com/v1`. `OUTPERO_MODE=api` is the default. No lead slug, lead-intake secret, webhook secret or `OUTPERO_ADAPTER_VERIFIED` switch is needed in this mode. An empty copy of `server/.env.example` does not hide a key already configured in the root file.

## Supabase

Run the complete current `supabase/calling.sql` after the existing `supabase/schema.sql`. It is rerunnable and preserves existing records. The direct API upgrade adds the selected employee, provider status, polling/error fields, capture-field mappings and recording expiry. Continue using the existing trusted admin account.

`supabase/seed-parent-feedback.sql` is optional. The portal already defaults to the supplied ten questions, Telugu and Vignan's introduction. Existing saved questions are preserved. Exact matches to the original ten questions also use the default capture mapping if they predate this upgrade.

## Configure Outpero once

1. Create or select an **Instant/outbound** employee. Inbound employees cannot place calls through `POST /calls`.
2. Publish the agent, enable/resume Instant calling, and configure its outbound number, calling hours, credits and retry settings in Outpero. A paused agent must be resumed there.
3. Use Telugu if that is the campaign language. The API does not replace the agent's language or instructions for each call.
4. In our portal, save questions, generate the script and paste it into that Outpero employee's instructions. Keep this script unchanged until the campaign is finished. The generated script includes the supplied Vignan introduction and the ten questions.
5. Set the pre-call variable `parent_name` if you use it in the greeting. The adapter fills declared name/parent_name/lead_name and phone variables automatically. Other required variables must have matching columns in the Excel upload.
6. For the default questions, configure these capture fields on the agent. The current Tanvi agent's capture-field names match this mapping:

| Question | Capture field | Type |
| --- | --- | --- |
| Overall satisfaction | `overall_satisfaction` | Number, 1?5 |
| Teaching quality | `teaching_quality` | Number, 1?5 |
| Academic progress | `academic_progress` | Yes/No |
| Communication satisfaction | `communication_satisfaction` | Yes/No |
| Safety and discipline | `safety_discipline` | Number, 1?5 |
| Services | `services_feedback` | Text |
| What parents like | `like_most` | Text |
| Improvements | `improvement_suggestion` | Text |
| Recommendation | `would_recommend` | Yes/No |
| Callback request | `callback_request` | Yes/No |

Custom questions can set an **Outpero capture field** in our editor. The key must match the agent's actual capture field. Missing answers remain unanswered; the app does not invent them. All captured responses are also visible in the call detail drawer. A callback answer is recorded; it does not automatically launch an additional call from our app.

## Run locally

In separate terminals, from the repository root:

```powershell
npm run server:dev
```

```powershell
npm run dev
```

Keep the backend running so queued calls are sent and results continue to sync. The browser can close after starting a campaign; the Node worker continues. Local health check: `http://localhost:4000/health`.

During `npm run dev`, the browser requests `/api` through Vite on the same address as the page. Vite forwards requests to `VITE_API_URL` (default `127.0.0.1:4000`), avoiding a separate cross-origin browser connection. Restart `npm run dev` after changing the backend URL. Production still uses `VITE_API_URL` directly.

Optional read-only diagnostic:

```powershell
npm run calling:check
```

It checks database access, the API key and available agents without placing calls or printing secrets. It reports paused, unpublished and inbound agents with the action needed in Outpero.

## Use the portal

1. Admin ? Branches ? branch ? year ? section ? Calling.
2. Create/open Parent Feedback.
3. Select an available outbound agent and click **Save agent**. Click **Refresh agents** after changing it in Outpero. Inbound/unpublished/paused agents are listed but unavailable.
4. Save the questions; generate and paste the current script into the selected agent. Ensure its language matches the campaign. Started campaigns cannot change agent, questions or contact list.
5. Upload `.xlsx` or `.xls` with `name` and `phone` columns. Add extra required variables as columns if your agent needs them. Start with your own consenting test number. The demo allows at most five unique contacts per campaign and files up to 2 MB.
6. **Check without calling** runs Outpero's `dry_run: true` validation for the first pending contact. It shows provider checks/warnings and does not dial anyone. This is optional; it does not guarantee a later live call will succeed if the account changes.
7. Confirm that the script is saved in Outpero and that the contacts consented. Click **Start calls**.
8. Live results show queued/scheduled/on-hold/in-progress statuses from Outpero and completed/failed/not-connected outcomes. Open a contact for its transcript, answers, recording and attempt history. Export CSV as needed.

Calling hours and provider retries still apply. Outpero may accept a call but schedule it for a later window. **Pause** prevents future local submissions; already accepted provider calls are not remotely canceled. **Retry failed** requeues final failed/no-answer results only, after active attempts finish. The provider's duplicate window may reject/reuse a recently submitted number; our app refuses to attach an older call's feedback to a new attempt.

## Optional settings

- `ALLOWED_ORIGIN`: exact frontend origins, comma-separated. Defaults to `http://localhost:5173,http://127.0.0.1:5173` so both local addresses work. For a hosted frontend, set its HTTPS origin explicitly.
- `PORT`: backend port, default 4000.
- `CALL_DELAY_MS`: spacing between local submissions, default 5000.
- `OUTPERO_POLL_INTERVAL_MS`: provider polling interval, default 5000, minimum 5000.
- `DEMO_MAX_CONTACTS`: 1?5, default 5.
- `DEMO_ALLOWED_PHONES`: optional comma-separated international numbers. When set, it further restricts admin-confirmed contacts.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`: optional transcript extraction when the provider does not supply mapped answers. Captured responses require neither.

## Hosting without a tunnel

The Node worker needs a continuously running Node process. It must not run as a background timer inside a Vercel serverless request.

**Keep Vercel for the frontend:** deploy the Node backend separately with `npm ci --omit=dev` then `npm run server`. Put the server secrets in that host's environment. Set backend `ALLOWED_ORIGIN` to your frontend origin. Set Vercel's `VITE_API_URL` to the backend HTTPS URL and rebuild/redeploy. Do not point Vercel visitors to your computer's localhost.

**Host both together:** build with the public Supabase variables and `VITE_API_URL=/`; run with `SERVE_FRONTEND=true` and the server secrets. `npm run server` serves `dist/`, `/admin`, and `/api` from the same host. No tunnel is needed in either setup.

## Optional webhooks

API polling is sufficient. If you later want webhooks on a hosted backend, use `/api/webhook/outpero` and set `OUTPERO_WEBHOOK_SECRET` to the endpoint's actual signing secret. The receiver verifies `X-Outpero-Timestamp` and `X-Outpero-Signature` using HMAC-SHA256 over `timestamp.rawBody`, with a five-minute timestamp tolerance. Select `call.completed` and `call.not_connected`; include transcripts. Test events are stored but never modify real calls. Polling still recovers results when webhook delivery is missed.

## Reliability and limitations

- Local attempts use stable `Idempotency-Key` and `external_id` values. If an API submission is interrupted, polling looks up that exact external ID before anything is retried. It never guesses by the latest phone-number match.
- Provider business outcomes (for example interested) are distinct from call status (completed); one cannot hide a successful call.
- Provider status and sync failures are shown separately. A network failure does not fabricate a completed conversation or trigger a new call automatically.
- Raw terminal provider responses and webhook events are saved before transactional completion. Duplicate delivery does not create duplicate feedback.
- Outpero recording URLs expire; the API currently documents a one-hour link. Saved transcripts and answers remain in Supabase. A recording link may need refreshing from Outpero after expiry.
- The five-contact cap is not a guaranteed spending cap: the agent's maximum duration, credits and retry policy are configured in Outpero.
- This implementation was tested with isolated SQL and simulated calls. A live phone test must still be performed using a consenting number and an enabled outbound agent.

## Verification

```powershell
npm test
npm run test:ui
npm run test:calling-ui
npm run build
```

Provider contract: [Outpero API reference](https://docs.outpero.com/#api), [published OpenAPI specification](https://docs.outpero.com/developers/openapi.json). The direct API is distinct from the older per-agent lead-intake integration, which remains available only with explicit `OUTPERO_MODE=lead` configuration.
