# TeleperformanceTravelManagementSystem

Teleperformance corporate travel management, recreated from the Unilever system at source revision `660c96c`. Uses the supplied Teleperformance logo and palette, with a new masthead, navigation rail, dashboard layout, sign-in design, dark theme and module entrance animations.

## Stack and workflow

React 19, TypeScript, Vite 8, Tailwind CSS, TanStack Query, Base UI, Supabase Auth/PostgreSQL/Realtime/Edge Functions and Dexie IndexedDB. Employee submission → Admin validation → assigned Manager budget approval → TMC ticket fulfillment → payment reconciliation. Corrections, rebooking, revision history, flight operations, cost-center billing and print/export behavior are retained. Ticket issuance and settlement are application simulations, without airline reservations or payment processing.

The separate Supabase project is `pfylcerdvtajgeoxlxvi` in Singapore. All six migrations are applied. No Unilever records or credentials are imported. Browser storage, account cache, broadcast channels and theme preferences have Teleperformance-specific identifiers.

## Run

```powershell
npm ci
Copy-Item .env.example .env.local
# Set the new project's URL and publishable key in .env.local.
npm run dev
npm test
npm run build
```

Without a configured backend the app uses its own browser-local demo database and clearly labeled role accounts. With Supabase configured, real Supabase authentication and shared records are used, and backend failures never fall back to local data.

## Demo accounts

| Role | Name | Email |
| --- | --- | --- |
| Requestor | Alexandra Rivera | alexandra.rivera@example.com |
| Admin | Camille Bautista | camille.bautista@example.com |
| Manager | Gabriel Navarro | gabriel.navarro@example.com |
| TMC | Rafael Castillo | rafael.castillo@example.com |

Generated passwords are in the local, ignored `.local/DEMO-ACCOUNTS.md`. They are not embedded in the app or committed. These are fictional demonstration profiles. Five sample requests cover intake, approval, fulfillment and issued tickets. Two additional schedules, `DEMO01A` and `DEMO02A`, support the saved-schedule status lookup without contacting an airline provider.

## Deployment

The new private GitHub repository is [Donrouevert/TeleperformanceTravelManagementSystem](https://github.com/Donrouevert/TeleperformanceTravelManagementSystem).

The new hosted deployment uses Sites with the same Vite SPA and separate Supabase backend. `vercel.json` is retained for a Vercel deployment: import the repository, choose Vite, use `npm run build` and `dist`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to this project's public connection values. If the deployment origin changes, update Supabase Site URL, recovery redirect allowlist and the Edge Function's `APP_ALLOWED_ORIGINS`.

`scripts/provision-supabase.mjs` applies migrations and creates sample accounts only for this project's guarded ID. `scripts/configure-backend.mjs` configures authentication redirects and deploys the status proxy. Administrative tokens are read from `SUPABASE_ACCESS_TOKEN` or the existing local Supabase CLI credential store; they never enter frontend variables or source control.

The authenticated `aviationstack` Edge Function is deployed with caching, rate limits and provider budget protection. Real airline status requires a new `AVIATIONSTACK_API_KEY` secret in this Supabase project. The demo schedule lookup works independently. Password-recovery UI is retained; sending recovery email to general recipients requires configuring the project's SMTP provider.

## Verification

The production build and inherited workflow/component tests are run for this recreation. New cloud role sign-ins and the complete Admin → Manager → TMC ticketing path are verified against the separate Supabase project. The desktop sign-in layout was visually inspected. Further browser interaction ended when Windows browser control could not verify the browser URL; responsive behavior is covered by component checks and CSS but has not been visually verified on devices.
