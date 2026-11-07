# Workspace service

`GET /api/workspace` loads the signed-in user's workspace. A signed-in account without a membership receives an empty state. `POST /api/workspace` applies a validated action and returns the updated state. Both responses disable caching.

## Identity and tenancy

Sites supplies verified ChatGPT identity. No passwords or social access tokens are stored. Users have one membership in this version; workspace owners start as admins. Admins add a name, verified sign-in email, and role. The matching signed-in person claims that invitation on their first request. No invitation email is sent. A private deployment's hosting audience still controls whether invited people can reach the app; adding a member does not change Site sharing.

Every lead, message, audit, notification, and saved social profile belongs to a workspace. Admins see all workspace records. Members see assigned leads and their conversations/audits, their own member profile, and their own social profile links. Members cannot invite people, assign leads to other people, or access admin notifications. All checks run on the server, independently of UI navigation.

## Writes

- `createWorkspace`: `name`
- `addLead`: `lead` with `name`, `company`; optional `industry`, `location`, `website`, `email`, `platform`, `profileUrl`, `socialLinks`, `ownerId`, `notes`
- `updateLead`: `id`, `changes` containing `status`, `ownerId`, `website`, and/or `notes`
- `inviteMember`: `name`, `email`, `role` (`admin` or `member`)
- `saveMessage`: `leadId`, `platform`, `body`, `status` (`draft` or `logged`), `direction` (`outbound` or `inbound`)
- `readNotifications`: no additional fields
- `saveAccount`: `platform`, `handle`, `profileUrl`

Writes require the exact same Origin as the request URL. Fields and payload size are bounded. Lead IDs and assignments are validated against workspace membership. Workspace creation and message/status/notification writes use D1 atomic batches.

A saved social profile is `profile_saved`, never `connected`. An outbound message is a draft or a manual log, never a provider delivery receipt. An inbound message entered through this API is a manually recorded reply; the admin notification states that provenance. Provider webhooks and outbound delivery require separate verified integrations and are not part of these actions.

Audit evidence is not accepted from this endpoint. The server audit service calls `requireWorkspace`, `requireLeadAccess`, and `storeAudit` after performing its checks.

## Validation

Generate the schema migration with `npm run db:generate` after installing dependencies. Run:

```sh
node --experimental-transform-types --test tests/workspace-policy.test.mjs
node --experimental-vm-modules --experimental-sqlite --test tests/workspace-isolation.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The isolation suite executes the actual service and Drizzle queries against an in-memory SQLite adapter implementing D1's query/batch behavior. It covers tenant isolation, member permissions, invitation claims, manual message provenance, notifications, and concurrent workspace creation. This is not a substitute for the hosted platform's authentication or deployment checks.
