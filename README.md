# Highlevel Leads

A working first version of a shared outreach workspace, built with React, TypeScript, Vinext, and Cloudflare D1 through Sites.

## Available now

- A labeled sample workspace, separate from database records, with admin/member previews.
- A live workspace with server-enforced admin/member permissions and tenant isolation.
- Lead creation, filtering, assignments, pipeline status, website edits, notes, social profile references, and CSV export.
- Saved outreach drafts, manually logged sends, manually recorded replies, and admin in-app notifications (visible-tab polling every 20 seconds).
- Rolling 7/30 day reports by team member; drafts excluded; deduplicated reply rates; CSV export.
- An actual HTTPS homepage SEO checklist, website-linked social profile discovery, and limited script-based tool detection.
- Dated manual evidence records for AI visibility, Google Business, and Google appearance.
- Admin-only invitations, per-member feature permissions, suspend/remove/restore controls, and protected owner access. Removal reassigns leads to the acting admin while preserving message history. No invitation email is sent.

## Integration and release boundaries

This is an initial product foundation, not the completed commercial SaaS. Live social search, OAuth connections, sending through social platforms, inbound webhooks, email delivery, subscriptions, and independent email/password authentication are not implemented. The lead finder searches workspace records or the labeled sample directory. Saving a profile URL does not connect an account. The inbox never claims to have delivered a message.

Instagram and Facebook are the first planned provider integrations. They require an appropriately configured Meta app and approved permissions. Their official APIs do not enable unrestricted cold messaging to personal accounts. See [provider capabilities and sources](docs/INTEGRATIONS.md).

The hosted version uses Sites-managed ChatGPT sign-in and starts owner-private. Adding an application membership does not change the hosting access policy; actual team access must be enabled separately. A standalone SaaS deployment needs a separately chosen identity and account lifecycle system. Each identity currently belongs to one workspace.

The SEO result covers fetched homepage HTML, not a site-wide crawl, Lighthouse performance, search rankings, or indexing verification. AI/Google evidence records are human observations, not automated visibility measurements. No tool guarantees discovery of all of a company's social accounts.

## Local development

Use Node 22.13 or newer and install the locked dependencies through the supplied Sites installer, or `npm run install:ci`. The provided execution profile is portable.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sloppy_thunderbolt.sql
npm run dev -- --hostname 127.0.0.1
```

Apply each local migration once. The printed preview URL is normally `http://127.0.0.1:5173/`. Local sign-in simulates a development identity only on loopback; it is absent from production builds. Local database and QA records are not published. The live workspace starts empty; the demo remains ephemeral.

## Verification

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-transform-types --test tests/workspace-policy.test.mjs
node --experimental-vm-modules --experimental-sqlite --test tests/workspace-isolation.test.mjs
node --experimental-strip-types --test tests/reporting.test.ts tests/seo-audit.test.ts
```

The 25 checks cover tenant/role isolation, revoked access, restricted features, assignment races, CSRF, input bounds, reporting semantics, CSV formula protection, SEO evidence extraction, redirects and URL restrictions. Direct local HTTP checks also exercised authentication, persisted lead/message writes, notifications, manual evidence records, and a real homepage SEO fetch. Visual browser QA was blocked by pending computer-use permissions in this session.

## Code map

- `app/workspace-app.tsx`, `app/globals.css`: responsive dashboard and workflows.
- `app/api/workspace/route.ts`: authenticated workspace reads and writes.
- `app/api/audit/route.ts`: authorized website audits and manual evidence recording.
- `lib/server-workspace.ts`, `lib/workspace-policy.ts`: workspace boundaries, validation and storage.
- `lib/seo-audit.ts`: restricted HTML fetch and evidence-based checks.
- `lib/reporting.ts`: reporting windows, attribution and exports.
- `lib/demo-data.ts`: clearly fictional sample data and ephemeral actions.
- `db/schema.ts`, `drizzle/`: D1 schema and migrations.
- `.openai/hosting.json`: private Sites project and storage binding.

## Next implementation phase

1. Choose production account onboarding and enable the intended team hosting audience.
2. Configure Meta developer app, approved scopes, callback URLs, encrypted token storage, connection health and revocation.
3. Implement eligible Facebook/Instagram conversations, verified inbound webhooks, event deduplication and provider message IDs.
4. Add approved business discovery/enrichment providers with source attribution and quotas.
5. Add auditable AI/Google measurement integrations, background jobs, email notifications and operational monitoring.

Do not enable the website fetcher on a host with private-network access without a hardened public-only outbound proxy. Read the documented network limitations before moving it away from its intended Worker environment.
