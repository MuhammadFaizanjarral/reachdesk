import {securePublicFetch} from './public-fetch.ts';
import type { AuditCheck } from './domain';

export type WebsiteAuditResult = {
  score: number;
  summary: string;
  checks: AuditCheck[];
  socialLinks: Record<string, string>;
  detectedTools: string[];
};

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Host validation is defense in depth, not DNS pinning. See docs/INTEGRATIONS.md. */
export function validateAuditUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a complete HTTPS website URL.'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Audits require an HTTPS website on port 443, without login credentials in the URL.');
  }
  // Reject every IP literal, single-label/intranet name, trailing-dot alias, and local-service suffix.
  // URL normalizes hexadecimal, integer and octal IPv4 forms before this check.
  const labels = hostname.split('.');
  if (!hostname.includes('.') || hostname.endsWith('.') || hostname.includes(':') || hostname.includes('[')
    || /^\d+(\.\d+){3}$/.test(hostname)
    || !/^[a-z0-9.-]+$/.test(hostname)
    || labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))
    || !/^[a-z][a-z0-9-]{1,62}$/.test(labels[labels.length - 1])
    || /(^|\.)(localhost|localdomain|local|internal|intranet|lan|home|test|invalid|onion|arpa)$/.test(hostname)
    || /(^|\.)(metadata\.google\.internal|metadata\.google|metadata\.azure\.com|instance-data\.ec2\.internal|nip\.io|sslip\.io|localtest\.me|lvh\.me|vcap\.me)$/.test(hostname)) {
    throw new Error('Only public website domain names can be audited. Local addresses and IP literals are not allowed.');
  }
  url.hash = '';
  return url;
}

function decode(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    const name = entity.toLowerCase();
    const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    if (name in entities) return entities[name];
    const number = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
  });
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const input = tag.replace(/^<\s*[a-z][\w:-]*/i, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    const name = match[1].toLowerCase();
    if (!(name in result)) result[name] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function tags(html: string, name: string): Record<string, string>[] {
  const expression = new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  return Array.from(html.matchAll(expression), (match) => attributes(match[0]));
}

function textContent(value: string): string {
  return decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractSocialLinks(html: string, baseUrl: string): Record<string, string> {
  const links: Record<string, string> = {};
  const hosts: Record<string, string> = {
    'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'm.facebook.com': 'Facebook',
    'linkedin.com': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X',
    'maps.google.com': 'google', 'maps.app.goo.gl': 'google',
  };
  for (const anchor of tags(html, 'a')) {
    if (!anchor.href) continue;
    try {
      const link = new URL(anchor.href, baseUrl);
      if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) continue;
      const host = link.hostname.toLowerCase().replace(/^www\./, '');
      const platform = hosts[host] ?? (host === 'google.com' && link.pathname.startsWith('/maps') ? 'google' : undefined);
      if (!platform || links[platform]) continue;
      if (/^\/(intent|share|sharer|sharer\.php|login|signup|search|hashtag|oauth)(\/|$)/i.test(link.pathname)) continue;
      if (platform !== 'google' && (!link.pathname || link.pathname === '/')) continue;
      link.hash = '';
      // Tracking parameters do not establish identity and need not be retained.
      if (platform !== 'google' && !(platform === 'Facebook' && link.pathname === '/profile.php')) link.search = '';
      links[platform] = link.href;
    } catch { /* Malformed anchor URLs are not evidence. */ }
  }
  return links;
}

/** Lightweight checks of the fetched HTML, not a browser-rendered or whole-site SEO crawl. */
export function analyzeHtml(html: string, url: string): WebsiteAuditResult {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const clean = withoutComments.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const metas = tags(clean, 'meta');
  const titles = Array.from(clean.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi), (m) => textContent(m[1]));
  const title = titles[0] ?? '';
  const description = metas.find((tag) => tag.name?.toLowerCase() === 'description')?.content?.trim() ?? '';
  const headings = Array.from(clean.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi), (m) => textContent(m[1]));
  const canonicalTags = tags(clean, 'link').filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes('canonical'));
  let canonical = '';
  try {
    const candidate = new URL(canonicalTags[0]?.href ?? '', url);
    if (canonicalTags[0]?.href && ['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password) canonical = candidate.href;
  } catch { /* Invalid canonical is reported below. */ }
  const viewport = metas.find((tag) => tag.name?.toLowerCase() === 'viewport')?.content ?? '';
  const images = tags(clean, 'img');
  const missingAlt = images.filter((tag) => !Object.prototype.hasOwnProperty.call(tag, 'alt')).length;
  const robots = metas.filter((tag) => ['robots', 'googlebot'].includes(tag.name?.toLowerCase() ?? '')).map((tag) => tag.content ?? '').join(',');
  const noindex = /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(robots);
  const scripts = Array.from(withoutComments.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi));
  const jsonScripts = scripts.filter((match) => attributes(`<script ${match[1]}>`).type?.toLowerCase() === 'application/ld+json');
  const validJson = jsonScripts.filter((match) => { try { const value = JSON.parse(match[2]); return value !== null && typeof value === 'object'; } catch { return false; } });

  const weighted: { weight: number; check: AuditCheck }[] = [];
  const add = (weight: number, label: string, status: AuditCheck['status'], detail: string) => weighted.push({ weight, check: { label, status, detail } });
  add(15, 'Page title', !title ? 'fail' : titles.length !== 1 || title.length < 15 || title.length > 60 ? 'warn' : 'pass',
    !title ? 'No non-empty title found in the HTML.' : `${title.length} characters: ${title}${titles.length > 1 ? ` (${titles.length} title tags found.)` : ''} Length guidance is a heuristic, not a ranking rule.`);
  add(15, 'Meta description', !description ? 'fail' : description.length < 50 || description.length > 160 ? 'warn' : 'pass',
    !description ? 'No meta description found.' : `${description.length} characters. Aim for a useful, distinct page summary; search engines may display a different snippet.`);
  add(15, 'Main heading', !headings.some(Boolean) ? 'fail' : headings.length === 1 ? 'pass' : 'warn',
    `${headings.length} H1 heading${headings.length === 1 ? '' : 's'} found.${headings[0] ? ` First: ${headings[0].slice(0, 180)}` : ''} A clear main heading helps describe the page.`);
  add(10, 'Canonical URL', canonical && canonicalTags.length === 1 ? 'pass' : 'warn',
    canonical ? `${canonicalTags.length} canonical tag${canonicalTags.length === 1 ? '' : 's'} found. First: ${canonical}` : 'No usable canonical URL found. Review duplicate URL handling.');
  add(10, 'Mobile viewport', /width\s*=\s*device-width/i.test(viewport) ? 'pass' : 'warn',
    viewport ? `Viewport: ${viewport}` : 'No viewport meta tag found. Mobile rendering has not been tested.');
  add(10, 'Image alt attributes', missingAlt ? 'warn' : 'pass',
    !images.length ? 'No image elements found in the fetched HTML.' : `${images.length - missingAlt} of ${images.length} images have alt attributes. Empty alt can be appropriate for decorative images; text quality needs manual review.`);
  add(10, 'Structured data', jsonScripts.length && validJson.length === jsonScripts.length ? 'pass' : 'warn',
    !jsonScripts.length ? 'No JSON-LD found. Add relevant structured data only when appropriate.' : `${validJson.length} of ${jsonScripts.length} JSON-LD blocks contain valid JSON. Schema vocabulary and rich-result eligibility were not validated.`);
  add(15, 'HTML indexing directive', noindex ? 'fail' : 'pass',
    noindex ? 'A noindex or none directive appears in a robots meta tag.' : 'No noindex directive found in HTML meta tags. HTTP headers, robots.txt, rendering and actual index status are not covered.');

  const detectedTools: string[] = [];
  const toolHosts: [RegExp, string][] = [
    [/(^|\.)(intercom\.io|intercomcdn\.com)$/, 'Intercom'],
    [/(^|\.)tidio\.co$/, 'Tidio'],
    [/(^|\.)chatbase\.co$/, 'Chatbase'],
    [/(^|\.)botpress\.cloud$/, 'Botpress'],
    [/(^|\.)voiceflow\.com$/, 'Voiceflow'],
  ];
  for (const match of scripts) {
    const src = attributes(`<script ${match[1]}>`).src;
    if (!src) continue;
    try {
      const scriptUrl = new URL(src, url);
      if (!['http:', 'https:'].includes(scriptUrl.protocol)) continue;
      for (const [pattern, name] of toolHosts) if (pattern.test(scriptUrl.hostname) && !detectedTools.includes(name)) detectedTools.push(name);
    } catch { /* Invalid script URLs are not evidence. */ }
  }
  const score = Math.round(weighted.reduce((sum, { weight, check }) => sum + weight * (check.status === 'pass' ? 1 : check.status === 'warn' ? 0.5 : 0), 0));
  const checks = weighted.map(({ check }) => check);
  if (detectedTools.length) checks.push({ label: 'Website tool evidence', status: 'unknown', detail: `Script references found for ${detectedTools.join(', ')}. This does not establish that an AI feature is active or that the business appears in AI answers.` });
  const issues = checks.filter((check) => check.status === 'warn' || check.status === 'fail').length;
  return {
    score,
    summary: `Homepage HTML checklist: ${issues} item${issues === 1 ? '' : 's'} to review across 8 checks. The ${score}/100 score uses fixed checklist weights; it is not a search ranking, Lighthouse score, or AI visibility measurement.`,
    checks,
    socialLinks: extractSocialLinks(clean, url),
    detectedTools,
  };
}

/** Fetch only the authorized lead website; the calling route must check lead ownership first. */
export async function auditWebsite(value: string,fetcher:typeof fetch=securePublicFetch): Promise<WebsiteAuditResult & { finalUrl: string }> {
  let target = validateAuditUrl(value);
  const permittedHost = target.hostname;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetcher(target.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Highlevel-Leads-WebsiteAudit/1.0' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('The website returned too many redirects or an invalid redirect.');
        const next = validateAuditUrl(new URL(location, target).href);
        if (next.hostname !== permittedHost) throw new Error('This website redirects to a different host. Update the lead website to its final HTTPS address before auditing.');
        target = next;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`The website returned HTTP ${response.status}.`); }
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!['text/html', 'application/xhtml+xml'].includes(contentType ?? '')) { await response.body?.cancel(); throw new Error('The website did not return an HTML page.'); }
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_BYTES) { await response.body?.cancel(); throw new Error('The page exceeds the 1 MB audit limit.'); }
      if (!response.body) throw new Error('The website returned an empty response.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let html = '';
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('The page exceeds the 1 MB audit limit.'); }
          html += decoder.decode(part.value, { stream: true });
        }
        html += decoder.decode();
      } finally { reader.releaseLock(); }
      return { ...analyzeHtml(html, target.href), finalUrl: target.href };
    }
    throw new Error('Unable to retrieve the website.');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The website did not respond within 12 seconds. Try again later.');
    throw error;
  } finally { clearTimeout(timer); }
}
