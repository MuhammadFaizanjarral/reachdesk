import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeHtml, auditWebsite, validateAuditUrl } from '../lib/seo-audit.ts';

const validPage = `<!doctype html><html><head><title>Useful services for local businesses</title>
<meta name="description" content="Explore our professional services for local businesses, including clear pricing, helpful guidance and a personal consultation.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>
</head><body><h1>Services for local businesses</h1><img src="/photo.jpg" alt="Our workshop"></body></html>`;

test('reports actual HTML evidence and a transparent checklist score', () => {
  const result = analyzeHtml(validPage, 'https://example.com/');
  assert.equal(result.score, 100);
  assert.equal(result.checks.length, 8);
  assert.ok(result.checks.every((check) => check.status === 'pass'));
  const sparse = analyzeHtml('<html><meta name="robots" content="noindex"><h1></h1></html>', 'https://example.com/');
  assert.equal(sparse.checks.find((check) => check.label === 'HTML indexing directive')?.status, 'fail');
  assert.equal(sparse.checks.find((check) => check.label === 'Page title')?.status, 'fail');
  assert.ok(sparse.score < 50);
});

test('ignores script/comment fake tags; distinguishes invalid JSON-LD', () => {
  const html = '<!-- <title>A fake page title that must not count</title> --><script>"<h1>Fake heading</h1>"</script><script type="application/ld+json">broken</script>';
  const result = analyzeHtml(html, 'https://example.com');
  assert.equal(result.checks.find((check) => check.label === 'Page title')?.status, 'fail');
  assert.equal(result.checks.find((check) => check.label === 'Main heading')?.status, 'fail');
  assert.equal(result.checks.find((check) => check.label === 'Structured data')?.status, 'warn');
});

test('discovers only actual social anchors and script host evidence', () => {
  const result = analyzeHtml(`${validPage}<p>https://instagram.com/not-a-link</p>
  <a href="https://instagram.com.evil.example/profile">Impostor</a><a href="javascript:alert(1)">Bad</a>
  <a href="https://www.instagram.com/acme/?utm_source=site">Instagram</a>
  <a href="https://x.com/intent/tweet?text=hello">Share</a><a href="https://x.com/acme">X</a>
  <a href="https://www.facebook.com/profile.php?id=123&amp;ref=website">Facebook</a>
  <script src="https://cdn.botpress.cloud/widget.js"></script>
  <script src="https://chatbase.co.evil.example/widget.js"></script>`, 'https://example.com');
  assert.equal(result.socialLinks.Instagram, 'https://www.instagram.com/acme/');
  assert.equal(result.socialLinks.X, 'https://x.com/acme');
  assert.equal(result.socialLinks.Facebook, 'https://www.facebook.com/profile.php?id=123&ref=website');
  assert.deepEqual(result.detectedTools, ['Botpress']);
  assert.equal(result.checks.at(-1)?.status, 'unknown');
  assert.equal(result.score, 100, 'tool detection must not change the SEO or AI visibility score');
});

test('rejects local network destinations, disguised IPs and unsafe URL forms', () => {
  const blocked = ['http://example.com', 'https://localhost', 'https://localhost.localdomain', 'https://127.0.0.1', 'https://2130706433', 'https://0x7f000001', 'https://0177.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://user:pass@example.com', 'https://example.com:8443', 'https://example.com.', 'https://metadata.google.internal', 'https://127.0.0.1.nip.io', 'https://app.local'];
  for (const value of blocked) assert.throws(() => validateAuditUrl(value), Error, value);
  assert.equal(validateAuditUrl('https://www.example.com:443/path#section').href, 'https://www.example.com/path');
});

test('limits redirects to the authorized host and does not request private redirect targets', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 302, headers: { Location: 'https://169.254.169.254/' } });
    }) as typeof fetch;
    await assert.rejects(auditWebsite('https://example.com'), /public website/);
    assert.equal(calls.length, 1);
    globalThis.fetch = (async () => new Response(null, { status: 301, headers: { Location: 'https://www.example.com/' } })) as typeof fetch;
    await assert.rejects(auditWebsite('https://example.com'), /different host/);
  } finally { globalThis.fetch = original; }
});

test('fetches same-host redirects, validates response type and enforces streaming size limit', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/old')
      ? new Response(null, { status: 302, headers: { Location: '/new' } })
      : new Response(validPage, { headers: { 'content-type': 'text/html; charset=utf-8' } })) as typeof fetch;
    assert.equal((await auditWebsite('https://example.com/old')).finalUrl, 'https://example.com/new');
    globalThis.fetch = (async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await assert.rejects(auditWebsite('https://example.com'), /HTML page/);
    globalThis.fetch = (async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await assert.rejects(auditWebsite('https://example.com'), /1 MB/);
  } finally { globalThis.fetch = original; }
});
