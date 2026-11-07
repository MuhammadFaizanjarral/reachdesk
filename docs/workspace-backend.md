# Workspace service

`GET /api/workspace` loads the signed-in user's workspace. A signed-in account without a membership receives an empty state. `POST /api/workspace` applies a validated action and returns the updated state. Both responses disable caching.

## Identity and tenancy

Better Auth supplies the authenticated email/password session. Each auth subject is bound to an admin-provisioned workspace membership. Only admins can add or manage team accounts. The first owner is provisioned through the trusted console command; there is no public signup or owner bootstrap API. No automatic invitation email is sent.

Every lead, message, audit, notification, and saved social profile belongs to a workspace. Admins see all workspace records. Members see assigned leads and their conversations/audits, their own member profile, and their own social profile links. Members cannot invite people, assign leads to other people, or access admin notifications. All checks run on the server, independently of UI navigation.

## Writes

- `createWorkspace`: `name`
- `addLead`: `lead` with `name`, `company`; optional `industry`, `location`, `website`, `email`, `platform`, `profileUrl`, `socialLinks`, `ownerId`, `notes`
- `updateLead`: `id`, `changes` containing `status`, `ownerId`, `website`, and/or `notes`
- `inviteMember`: `name`, `email`, `role` (`admin` or `member`)
- `saveMessage`: `leadId`, `platform`, `body`, `status` (`draft` or `logged`), `direction` (`outbound` or `inbound`)
- `readNotifications`: no additional fields
- `saveAccount`: `platform`, `handle`, `profileUrl`

Writes require the exact configured application Origin (including when the server is behind Vercel's proxy). Fields and payload size are bounded. Lead IDs and assignments are validated against workspace membership. Workspace creation and message/status/notification writes use LibSQL atomic batches.

A saved social profile is `profile_saved`, never `connected`. An outbound message is a draft or a manual log, never a provider delivery receipt. An inbound message entered through this API is a manually recorded reply; the admin notification states that provenance. Provider webhooks and outbound delivery require separate verified integrations and are not part of these actions.

Audit evidence is not accepted from this endpoint. The server audit service calls `requireWorkspace`, `requireLeadAccess`, and `storeAudit` after performing its checks.

## Validation

Generate the schema migration with `npm run db:generate` after installing dependencies. Run:

```sh
node --experimental-transform-types --test tests/workspace-policy.test.mjs
node --experimental-vm-modules --experimental-sqlite --test tests/workspace-isolation.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The isolation suite executes the actual service and Drizzle queries against the production LibSQL driver and a temporary SQLite database. It covers tenant isolation, member permissions, invitation claims, manual message provenance, notifications, and concurrent workspace creation. This is not a substitute for the deployed app's authentication or deployment checks.
