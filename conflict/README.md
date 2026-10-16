# ASTRA backend

Standalone TypeScript API service for ASTRA authentication and profile data. Keep privileged Supabase and Judge0 credentials in this service's environment only.

## Local setup

1. Apply all SQL migrations in `supabase/migrations/` to the Supabase project, or use the consolidated `supabase/ASTRA_SETUP_ALL.sql` in the Supabase SQL Editor. These create the outsider credentials, profile activity, notifications, question library/test-case storage, and contest registration storage.
2. Copy `conflict/.env.example` to `conflict/.env`.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `ASTRA_SESSION_SECRET` of at least 32 characters.
4. Configure the existing member credential/profile table fields using the `MEMBER_*` variables. Defaults are `user.society_id`, `user.email`, `user.password_hash`, and `member.society_id`. Password hashes in the member credential table must be bcrypt hashes.
5. Set `ASTRA_ADMIN_ACCOUNT_IDS` to a comma-separated allowlist of admin account IDs. For members, use their configured society ID; for outsider accounts, use the account UUID. Only these signed-in accounts can publish notifications.
6. In `shuffal/.env.local`, set `NEXT_PUBLIC_API_URL=http://localhost:4000`.
7. Configure Judge0 in this backend environment: set `JUDGE0_API_URL` to your Judge0 API base URL. Set `JUDGE0_API_KEY` and `JUDGE0_AUTH_HEADER` when your provider requires authentication; the header defaults to `X-Auth-Token`. RapidAPI endpoints also get the `X-RapidAPI-Host` header automatically. Never put Judge0 credentials in the frontend environment.
8. Set `ASTRA_ADMIN_ACCOUNT_IDS` to a comma-separated allowlist of admin account IDs. Admins can create one question in guided steps or import up to 25 questions from JSON at `/admin` → **Questions**. JSON may be an array, a `{ "questions": [...] }` object, or one question object; each question requires title, difficulty, topic, tags, description, input/output formats, constraints, sample input/output, and 1–25 `{ "input": "...", "expected": "..." }` test cases. The admin page includes a downloadable JSON template and validates the whole file before saving. Keep imports under 90 KB.

Start the frontend and backend in separate terminals from the repository root:

```sh
npm run dev:frontend
npm run dev:backend
```

Run the backend judge comparison tests with `npm test --workspace conflict`.

The API health endpoint is `http://localhost:4000/api/health`. Authentication uses an HTTP-only, signed session cookie that expires after 30 minutes; do not store the session token in browser storage.

Admins can publish announcements from `/admin`. Signed-in accounts see unread announcements at `/notifications`; the navigation badge polls for new items and shows a red dot while unread announcements remain.

The problem workspace loads available C, C++, Java, JavaScript, and Python 3 versions from the configured Judge0 instance using `GET /api/judge/languages`; version names and IDs are never guessed in the frontend. The backend requires a signed-in session, limits executions, submits code to Judge0, and polls for results. `POST /api/judge/execute` only runs the supplied program and does not update solved progress. `POST /api/judge/submit` runs the private test suite with bounded concurrency and only records Accepted when every test output matches (line endings are normalized and one trailing newline is ignored). The console timer starts when the problem workspace opens and persists through a tab reload; final judged submissions store session start, submission time, and elapsed seconds. Copy, cut, paste, and the editor context menu are disabled in Monaco as a deterrent, not as tamper-proof proctoring.

The Progress page summarizes judged submission history by account: total submissions, distinct questions attempted, the percentage of attempted questions with an Accepted verdict, verdict counts, attempted-versus-solved counts by difficulty, and tags on attempted questions that do not yet have an Accepted submission. These metrics describe recorded submissions only.

Contests are stored in `public.astra_contests`; signed-in members and guests can register or cancel before a contest starts. The initial migration seeds the three example contests shown in the portal. Add or update future contest rows in that table using a trusted database administrator. The Society leaderboard is calculated from unique accepted problems, awarding 10 points for Easy, 20 for Medium, and 30 for Hard; only display names, solved counts, and points are returned.

Outsider accounts are stored only in `public.astra_credentials`; passwords are bcrypt-hashed on the server. The service-role key is backend-only. Profile photos are validated (JPG/PNG/WebP, 5 MB maximum), stored in the private Supabase bucket, and served using signed URLs.

Member table columns differ between projects, so set their exact existing identifiers through `MEMBER_*` variables. If the existing password hash format is not bcrypt, the member password verifier must be adjusted to that hash algorithm before enabling member sign-in.
