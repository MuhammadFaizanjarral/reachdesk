# Highlevel Leads

A standard Next.js app for the user's Vercel account. Email/password authentication, admin-only team management, member restrictions, lead workflows, reports and audits are retained. This edition uses a remote libSQL-compatible SQLite database (for example, Turso), rather than Cloudflare D1. It has no dependency on ChatGPT sign-in or Sites hosting.

The original deployed Site remains separate and unchanged by this migration preparation.

## Deployment

1. This project is in [`MuhammadFaizanjarral/reachdesk`](https://github.com/MuhammadFaizanjarral/reachdesk). The user has connected it to Vercel, so pushes to `main` trigger the connected deployment. Use the repository root, the **Next.js** preset, and the included `vercel.json`.
2. Provision a **libSQL-compatible** hosted database. Configure its URL and token in Vercel environment variables, using a separate database for preview deployments.
3. Set the runtime environment variables below. Use the exact intended production domain for `BETTER_AUTH_URL`. Never put secrets in source or a `NEXT_PUBLIC_` variable.
4. Apply database migrations once using `npm run db:migrate` from a trusted environment with target database credentials. Do not run production migrations against every preview build.
5. Deploy with Vercel's **Next.js** preset and `npm run build`, or run `npx vercel --prod`.
6. If data needs copying, import a complete verified snapshot before allowing new records, then compare table counts and test account access. See the migration section below.
7. Run `npm run owner:link` in a trusted console with production environment variables to create the first administrator activation link. The owner chooses their own password through that private single-use link. For an existing migrated owner, the script preserves their identity and generates a recovery link instead of replacing the account.
8. Sign in, invite a member, generate their activation link under **Team members → Manage access**, and verify restrictions.

GitHub deployment checks show the actual Vercel build result. A successful build does not configure the database, apply migrations, or activate the owner account. Complete [the production setup checklist](docs/VERCEL-SETUP.md) before using real records.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | Remote libSQL/HTTPS database URL. Local files are rejected on Vercel. |
| `TURSO_AUTH_TOKEN` | Database access token; store as a secret. |
| `BETTER_AUTH_SECRET` | Random signing secret of at least 32 characters; store as a secret. Generate with `openssl rand -base64 48`. |
| `BETTER_AUTH_URL` | Exact app origin, including HTTPS in production. Update if the domain changes. |
| `BOOTSTRAP_OWNER_EMAIL` | Owner email used only by the trusted-console owner-link command. |
| `BOOTSTRAP_OWNER_NAME` | Optional owner display name. |

Use Vercel environment settings or `vercel env add` to enter production secrets. Do not send tokens or passwords through chat. `.env.local`, local databases, dependencies and build output are excluded from upload by `.vercelignore`.

## Local development

Use a current Node.js 22 release (22.13 or newer). Vercel is pinned to the 22.x runtime through `package.json`.

```sh
npm ci
# Copy .env.example to .env.local, then fill the values.
npm run db:migrate
npm run owner:link
npm run dev
```

For local-only testing, `TURSO_DATABASE_URL=file:.local/highlevel.db` is supported after creating `.local/`. These local records are never a production data source. Set `BETTER_AUTH_URL` to the local server's exact origin. The one-time owner link is sensitive; share it only with the intended owner and do not commit it.

## Preserving existing records and accounts

The user requested preservation. A read-only check of the current deployed source on November 7, 2026 found **zero rows** in all nine durable application/account tables: workspaces, members, auth_user, auth_account, leads, messages, audits, accounts and notifications. The visible sample workspace is illustrative client data, separate from that database.

Recheck the source at cutover if anyone begins using it. Do not import truncated tool projections or reconstruct records from summaries. `scripts/import-snapshot.mjs` accepts a complete exact export, validates all tables/columns, refuses non-empty target tables, imports in one transaction, and compares row counts. Run only against the intended empty target after migrations:

```sh
node --env-file-if-exists=.env.local scripts/import-snapshot.mjs /protected/path/snapshot.json
```

Keep exports outside the repository with restricted permissions. IDs, permissions, status, notes and password hashes must be preserved. Session tokens, login rate-limit records, verification records and outstanding activation/recovery links are not migrated; users sign in again and admins regenerate any needed links for the new domain.

## Account and feature access

Only admins can add members, change permissions, suspend, remove or restore access. Suspension/removal invalidates sessions and outstanding account links. Removal reassigns leads while preserving activity history. Team members cannot promote themselves or view another member's assigned work. CSV exports are off for members by default.

Public signup endpoints are disabled. Members receive single-use activation/recovery links generated by admins; the app does not send automatic emails yet. The first owner setup is a trusted operational command, not a public bootstrap endpoint. Authenticated users can change their passwords and revoke other sessions.

## Audits and integrations

The SEO audit fetches one authorized HTTPS homepage. In the Node runtime it resolves DNS, rejects private/reserved destinations, pins the actual socket to a validated public address, preserves TLS hostname validation, validates every redirect and applies time/size limits. It does not execute JavaScript or perform a complete crawl.

AI visibility and Google appearance are manual evidence records. Live social discovery, provider OAuth, social message delivery and inbound webhooks still need the approved integrations described in `docs/INTEGRATIONS.md`.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

The workspace suite runs the real service through the LibSQL driver against a temporary SQLite file. It covers tenant/role isolation, atomic writes, permission restrictions, password activation/recovery and revoked sessions. Additional suites cover reporting, CSV protection, SEO parsing and public-network destination checks. Browser visual review was not available in the preparation environment; build and HTTP checks are reported separately.

## Primary deployment references

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Deploy from Vercel CLI](https://vercel.com/docs/projects/deploy-from-cli)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Turso TypeScript/libSQL reference](https://docs.turso.tech/sdk/ts/reference)
