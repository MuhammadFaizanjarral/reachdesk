# Highlevel Leads access controls

## Current authentication

The deployed private Site uses verified ChatGPT identity supplied by Sites. The app does not accept identity, role, or workspace claims from request bodies. Every workspace request checks the current database membership. Access to the hosted URL and membership in the application are separate controls.

A standalone email/password or Google login is not yet configured. It requires an identity provider account, verified domain/callback configuration, email delivery configuration, and deployment support. Preserve the current platform authentication boundary until that deployment has been configured and tested. No password collection form should be shipped without a working credential and recovery service behind it.

## Admin-only team management

Only workspace admins may invite people, set member permissions, suspend accounts, remove accounts, or restore membership. A verified invited email binds to its membership at first sign-in. Uninvited people cannot join an existing workspace. The existing tenant-creation flow is separate from team membership; production onboarding must decide whether new tenant signup is public or admin provisioned.

- Suspended members cannot read or write workspace APIs; assignments remain intact.
- Removed members cannot read or write workspace APIs; their leads transfer to the acting admin in the same D1 batch.
- Historical messages and member IDs remain for reporting.
- Restoring an unclaimed invitation returns it to invited status. Restoring a claimed account returns it to active.
- Restoring a removed member does not reclaim leads already transferred to another person.
- The workspace owner and the acting admin cannot restrict or remove their own admin access through these controls.
- Only the owner may manage another admin's status. All admins retain full feature permissions.

Revocation takes effect on subsequent server requests, including requests made with an existing sign-in session. The open interface checks membership on visible-tab polling and displays an access-blocked screen on rejection.

## Member permissions

Admins set these in **Team members → Manage access**. Members always have read access to their assigned lead records. They cannot see another member's assigned work or admin notifications.

| Permission | Enforcement |
| --- | --- |
| Lead finder | Workspace-directory screen availability; no external discovery API exists yet. |
| Add new leads | Server authorization for lead creation. |
| Edit assigned leads | Server authorization for status, notes, and website updates. Only admins reassign leads. |
| Inbox and outreach | Server authorization for drafts/manual message logs; conversation payload excluded when disabled. |
| View and run audits | Server authorization before fetching a site or recording evidence; audit payload excluded when disabled. |
| View own reports | Server report endpoint and module access. |
| Download data exports | Server CSV endpoint; disabled for members by default. |
| Manage own social profiles | Server profile-save checks and response filtering. |

Feature restrictions do not change the fact that a member can read their assigned leads. Data already viewed or downloaded cannot be remotely erased. Reports include only authorized records.

## Production authentication next steps

1. Choose email/password, optionally with Google sign-in, and configure the identity provider and supported hosting.
2. Implement verified-email, invite-based team account activation; bind the provider's stable subject to the member record server-side.
3. Add sign-in/out, forgot-password, password-reset, verification and invitation-acceptance flows.
4. Add administrator MFA and provider session revocation when supported.
5. Configure production redirect URLs, secret storage, email sender, domain, and account recovery.
6. Test admin, member, suspended, removed and expired/revoked sessions before enabling team hosting access.

Never permit clients to assign themselves admin roles, mutate membership fields during signup, or bypass these server checks.
