# Highlevel Leads accounts and access controls

## Email/password authentication

The application uses Better Auth 1.7.18 and its Drizzle SQLite adapter. The password, credential, session, verification and rate-limit tables are separate from workspace memberships. Passwords use Better Auth's hashing implementation; the app never returns password hashes or stores plaintext passwords. New passwords must be 12–128 characters. Session cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Sessions expire after seven days, cookie caching is disabled, and the current database membership is checked for workspace access. Login requests are rate limited using database-backed counters and Vercel's `x-vercel-forwarded-for` client-address header.

The catch-all auth handler explicitly exposes sign-in, sign-out, session lookup and authenticated password changes only. Public signup, account linking, user deletion and other library endpoints are not exposed. Application role and workspace claims never come from client-supplied signup fields.

### First owner setup on Vercel

There is no public bootstrap or owner-recovery API. An operator with target database credentials runs `npm run owner:link` in a trusted console. The script checks `BOOTSTRAP_OWNER_EMAIL`, verifies an existing owner if present, preserves their ID, and issues a single-use activation or recovery link. For a new empty database it atomically creates the owner workspace/membership first. The owner sets their own password through that link. The application accepts only a valid password session; no ChatGPT identity headers are used.

### Team activation and recovery

1. An admin creates the member invitation with a name, email and role.
2. In **Team members → Manage access**, the admin generates an activation link.
3. The admin privately shares the single-use link with the intended member. No email is sent by the app.
4. The member sets their own password, then signs in with email/password.

Activation links expire in 24 hours. Recovery links expire in one hour. Only a hash of the random 256-bit link token is stored. Tokens are transported in URL fragments and redeemed with same-origin POST requests. Generating a new link invalidates outstanding links for that member. Tokens cannot be reused. Password recovery invalidates existing sessions. Suspensions/removals invalidate sessions and outstanding links.

Invitation possession authorizes this manually provisioned account setup; a separate automatic email-ownership verification service is not configured. Do not describe these as sent or verified-email invitations. Forgot-password directs members to their admin for a recovery link. Password changes require the current password and revoke other sessions.

## Admin-only management

Only admins may add people, set permissions, suspend, remove or restore memberships. Uninvited people cannot create a password account. A member's stable auth identity is bound to the existing member record server-side; users cannot promote themselves or select another workspace at login.

- Suspension blocks workspace requests and keeps lead assignments.
- Removal blocks workspace requests and transfers leads to the acting admin in an atomic database batch.
- Historical messages and member IDs remain for reporting.
- Restoration keeps the same account. Restoring an unclaimed invitation returns it to invited status.
- Restoring a removed member does not reclaim leads that were transferred.
- The owner and acting admin cannot remove or restrict their own admin access through these controls.
- Only the owner may manage another admin's status. All admins retain full feature permissions.

## Per-member permissions

Admins set these in **Team members → Manage access**. Members always have read access to their assigned lead records. They cannot see other members' assigned work or admin notifications.

| Permission | Enforcement |
| --- | --- |
| Lead finder | Workspace-directory screen availability; no external discovery API exists yet. |
| Add new leads | Server authorization for creation. |
| Edit assigned leads | Server authorization for status, notes and website updates. Only admins reassign leads. |
| Inbox and outreach | Server write checks; conversation payload excluded when disabled. |
| View and run audits | Server authorization before fetching or recording; audit payload excluded when disabled. |
| View own reports | Server report endpoint and module access. |
| Download data exports | Server CSV endpoint; disabled for members by default. |
| Manage own social profiles | Server profile-save checks and response filtering. |

Feature restrictions preserve read access to assigned leads. Data already viewed or downloaded cannot be remotely erased. Reports include only authorized records.

## Runtime configuration and deployment

- `BETTER_AUTH_SECRET`: generated server-side signing secret, stored as a Vercel secret.
- `BETTER_AUTH_URL`: exact application origin; update it if the domain changes.
- `BOOTSTRAP_OWNER_EMAIL`: configured owner identity, stored as a Vercel secret.

Keep local `.env.local` ignored. Apply migrations once to the intended target with `npm run db:migrate`. Production credentials and local QA records are not included in source or archives.

Before broad team rollout: complete owner setup, test one invitation and its restrictions, and configure an email sender if automatic activation/recovery emails are desired. Administrator MFA and additional operational monitoring remain future work.

## Primary references

- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password)
- [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Next.js integration and session cookies](https://better-auth.com/docs/integrations/next)
