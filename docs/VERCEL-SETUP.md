# Production setup for the connected Vercel project

Repository: https://github.com/MuhammadFaizanjarral/reachdesk

The repository root is the application root. It uses the Next.js preset, Node.js 22.x, `npm ci`, and `npm run build`. The included Vercel configuration supplies these build commands. Pushes to the connected production branch trigger Vercel automatically.

## 1. Connect the database

Use a hosted **libSQL-compatible** SQLite database, such as a libSQL database in Turso. This application does not currently use PostgreSQL or a local SQLite file in production. Obtain the database URL and its access token from the provider. A normal provider integration does not create the app's tables; apply the migrations in step 3.

Use a separate database for preview deployments so test branches do not write to production records. Keep the original deployment until the new database and account flow are verified.

## 2. Add Vercel environment variables

Open the Vercel project → **Settings → Environment Variables** and set the following for Production. Configure separate preview values if preview deployments are enabled.

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | The hosted libSQL database URL. |
| `TURSO_AUTH_TOKEN` | Its access token; mark as sensitive. |
| `BETTER_AUTH_SECRET` | A generated random value of at least 32 characters; mark as sensitive. Generate one locally with `openssl rand -base64 48`. |
| `BETTER_AUTH_URL` | The exact production HTTPS origin from Vercel, with no trailing path. |
| `BOOTSTRAP_OWNER_EMAIL` | The intended first admin's email. |
| `BOOTSTRAP_OWNER_NAME` | Optional first admin display name. |

Never put secret values in `.env.example`, a commit, an issue, or chat. Vercel environment changes apply to a new deployment; redeploy after adding/changing them. If the domain changes, update `BETTER_AUTH_URL` and redeploy. The configured origin is also used for same-origin write checks.

## 3. Apply the database schema

From this checkout in a trusted terminal, use the target database credentials. For a manual one-time setup, create an ignored `.env.local` from `.env.example` and fill it with the production target values, then run:

```sh
npm ci
npm run db:migrate
```

Do not run production migrations automatically from every preview build. The migration command uses Drizzle's migration journal and can be rerun without replaying already applied migrations.

## 4. Activate the first admin

With the same production environment available in that terminal:

```sh
npm run owner:link
```

This prints a private one-time setup link valid for one hour. Open it yourself and choose a password. For an existing owner account, the command preserves the owner identity and creates a recovery link. Do not share this owner link publicly. There is no open admin-registration endpoint.

## 5. Verify production access

- The login page loads without ChatGPT sign-in.
- Unauthenticated `/api/workspace`, `/api/report`, and `/api/export` requests are rejected.
- The owner can sign in and invite a member.
- A member's activation link works once, and the member cannot manage accounts or access other people's assigned leads.
- Suspending/removing the member revokes access.

## Existing data

The user requested preservation of records and accounts. A read-only check of the source deployment on November 7, 2026 found no saved rows in the nine durable workspace/account tables. The sample workspace is not production data. Recheck at cutover if the original app has since been used. The exact-snapshot importer is available for that case; never import truncated or reconstructed records. Sessions and outstanding setup links are not copied to a different domain.

## References

- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/environment-variables/managing-environment-variables
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://docs.turso.tech/sdk/ts/reference
