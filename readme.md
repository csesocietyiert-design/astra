# ASTRA

ASTRA is the CSE Society, IERT coding practice portal. It includes a Next.js
frontend, a TypeScript/Express API, Supabase-backed account and activity
storage, and Judge0 integration for code execution and judging.

## Features

- Society-member and guest sign-in, profiles, and notifications
- Problem library, editor, code execution, and judged submissions
- Submission history, progress, and accepted-problem leaderboard
- Contest listings and signed-in contest registration
- Admin tools for publishing announcements and managing problems

## Requirements

- Node.js compatible with the versions of Next.js and TypeScript in the package
  manifests
- npm
- A Supabase project
- A Judge0 API endpoint for code execution and judging

## Local setup

1. Install dependencies from the repository root:

   ```sh
   npm install
   ```

2. Create `conflict/.env` using `conflict/.env.example` as a template. Set the
   Supabase URL, Supabase service-role key, and an `ASTRA_SESSION_SECRET` with
   at least 32 characters. Configure member-table mappings and Judge0 settings
   as needed. Keep backend secrets in this file; do not put them in frontend
   variables or commit them.

3. Create `shuffal/.env.local` and set:

   ```dotenv
   NEXT_PUBLIC_API_URL=http://localhost:4000
   ```

4. Apply the Supabase migrations in `supabase/migrations/` in filename order,
   or run the consolidated setup script `supabase/ASTRA_SETUP_ALL.sql` in the
   Supabase SQL Editor. Use the SQL Editor for the Supabase project you intend
   this local installation to use. The setup script creates the application
   tables, contest tables, and initial contest listings.

5. In separate terminals from the repository root, start the API and frontend:

   ```sh
   npm run dev:backend
   npm run dev:frontend
   ```

   Open [http://localhost:3000](http://localhost:3000). The API health endpoint
   is [http://localhost:4000/api/health](http://localhost:4000/api/health).

## Environment and security

See [`conflict/README.md`](./conflict/README.md) for backend configuration,
member account mappings, Judge0 settings, and API behavior. Never commit
`.env` files, service-role keys, database passwords, or Judge0 credentials.
The service-role key belongs only in the backend environment.

Apply new SQL files in `supabase/migrations/` before using features introduced
by those migrations. Keep the consolidated setup script in sync when adding
new database requirements.

## Validation

Run the backend tests:

```sh
npm test --workspace conflict
```

Build and lint the backend:

```sh
npm run build --workspace conflict
npm run lint --workspace conflict
```

Build the frontend:

```sh
npm run build --workspace shuffal
```

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Vercel, Render, and Supabase
deployment instructions.
