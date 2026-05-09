# Deployment Guide

Recommended production setup:

- Frontend: Vercel
- API/functions: Supabase Edge Functions or another Deno-compatible host
- App data: Firebase/Firestore as currently wired

This split fits the current code because the frontend is a Vite SPA and the `functions/*` handlers use `Deno.serve`.

## 1. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the output as `ENCRYPTION_KEY` in the functions provider. It must be 64 hex characters.

## Fast Deploy From This Machine

Copy the deployment secrets template:

```bash
cp .env.deploy.example .env.deploy.local
```

Fill `.env.deploy.local`, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1
```

The script type-checks, builds, prepares Supabase functions, sets Supabase secrets, deploys all functions, then deploys the Vercel frontend.

## 2. Deploy Edge Functions

Prepare Supabase-compatible function folders:

```bash
npm run prepare:supabase-functions
```

Deploy each required function from `supabase/functions/*` with the Supabase CLI, then set these server secrets:

```bash
ENCRYPTION_KEY
ANTHROPIC_API_KEY
OPENROUTER_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_REDIRECT_URI
REDDIT_USER_AGENT
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_GSC_REDIRECT_URI
GOOGLE_GMAIL_REDIRECT_URI
```

Set OAuth callback URLs to the deployed function URLs, for example:

```text
https://<project-ref>.supabase.co/functions/v1/reddit-oauth/callback
https://<project-ref>.supabase.co/functions/v1/gsc-oauth/callback
https://<project-ref>.supabase.co/functions/v1/gmail-oauth/callback
```

## 3. Deploy Frontend To Vercel

Set Vercel environment variables:

```bash
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_OPENROUTER_API_KEY=
VITE_GEMINI_API_KEY=
```

Then deploy:

```bash
npm run build
vercel --prod
```

## What Works After Deployment

- Token save/status/revoke through the deployed `platform-auth` function
- Medium, Dev.to, Hashnode posting through API functions
- Reddit, Gmail, and Search Console OAuth callbacks
- Ranking sync and indexation requests
- Distribution scheduling UI with deployed endpoint execution

## Still Needs A Real Backend Upgrade

`/tmp/platform-tokens.json` is acceptable only for prototype testing. Serverless `/tmp` can reset at any time. Before real users, replace token storage with Supabase Postgres/KV or another durable encrypted store.

Quora automation uses Playwright and may not run on normal serverless/edge environments. Use a self-hosted worker for Quora.
