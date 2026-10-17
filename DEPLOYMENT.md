# Deploying ASTRA

ASTRA uses Vercel for the Next.js frontend, Render for the API, and Supabase
for authentication data and profile-photo storage. Deploy both services from
the `main` branch of `csesocietyiert-design/astra`.

## 1. Deploy the frontend to Vercel

1. Import `https://github.com/csesocietyiert-design/astra` into Vercel.
2. Set the project root directory to `shuffal`.
3. Keep the detected Next.js framework, install command, and build command.
4. After completing the backend deployment below, add the Vercel environment
   variable `ASTRA_API_URL` with the Render API URL.

The frontend can be deployed before setting `ASTRA_API_URL`; redeploy it after
adding the API URL so the rewrite is included in the production build.

## 2. Deploy the API to Render

1. In Render, create a Blueprint from the GitHub repository
   `csesocietyiert-design/astra`. Render reads
   `render.yaml` and creates the `astra-api` web service.
   The API build command installs development dependencies for TypeScript
   compilation and builds only the `conflict` workspace. If creating a Web
   Service manually, use `npm ci --include=dev && npm run build --workspace
   conflict` as the build command and `npm run start` as the start command;
   do not use the root `npm run build`, which also builds the frontend.
2. Set `FRONTEND_ORIGIN` to the allowed frontend origins, separated by commas
   and without trailing slashes. Include every active production domain, for
   example `https://astra.iert.ac.in,https://astra-iert.vercel.app`. If the
   currently deployed API predates comma-separated origins, first set only
   `https://astra.iert.ac.in` to restore the service, deploy the updated API,
   then add the Vercel origin if it is still needed.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` using the Supabase
   project URL and service-role key. Keep the service-role key only in Render.
4. Render generates `ASTRA_SESSION_SECRET` for the service.
5. Wait for the service to deploy, then verify
   `https://<your-render-service>.onrender.com/api/health` returns
   `{"status":"ok","service":"astra-api"}`.

Render assigns `PORT` automatically. Do not commit secret values or put them
in Vercel environment variables.

## 3. Connect the frontend to the API

In Vercel project settings, add `ASTRA_API_URL` with the full Render service
URL, without a trailing slash, for example `https://astra-api.onrender.com`.
Redeploy the frontend after setting it.

In production, the frontend sends API requests to its own `/api` paths, and
Vercel rewrites those paths to Render. This keeps session cookies first-party
even though the services have different provider URLs. The API allows
credentialed requests only from origins in `FRONTEND_ORIGIN` and checks the
`Origin` of state-changing requests. The deployed custom domain must be in
this list as well as the Vercel domain if both are used.

## 4. Configure Supabase and optional services

1. Apply all SQL migrations in `supabase/migrations/` to the Supabase project.
   The latest migrations create accepted-activity, submission-history,
   notification, and contest registration tables and support persistent
   profiles for guest logins without a Society ID, plus the persistent problem
   library and private Judge0 test cases; apply them before deploying the API.
2. Set the `MEMBER_*` variables in Render to match the existing member
   credential and profile tables. Check `conflict/.env.example` for names and
   defaults; the member password hashes must be bcrypt hashes.
3. Set `ASTRA_ADMIN_ACCOUNT_IDS` in Render to a comma-separated allowlist of
   admin account IDs. Use society IDs for member accounts and account UUIDs for
   outsider accounts; only these signed-in accounts can publish announcements.
4. To enable code execution, set `JUDGE0_API_URL` in Render and, if required by
   the provider, `JUDGE0_API_KEY` and `JUDGE0_AUTH_HEADER`.
5. Configure `TURNSTILE_SECRET_KEY` in Render if the deployment uses
   Cloudflare Turnstile verification.

After changing any backend environment variables, redeploy or restart the
Render service.
