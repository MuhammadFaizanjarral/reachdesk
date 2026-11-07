import type { WorkspaceState, Role } from './domain';

export type MemberReport = {
  memberId: string; name: string; role: Role;
  sent: number; replies: number; leads: number; replyRate: number;
};
export type OutreachReport = {
  period: 'week' | 'month'; days: number; start: string; end: string;
  timezone: 'Asia/Karachi'; label: string;
  sent: number; replies: number; leads: number; replyRate: number;
  members: MemberReport[];
  daily: { date: string; label: string; sent: number; replies: number; leads: number }[];
};

const DAY = 86_400_000;
const zone = 'Asia/Karachi';
const localDay = (time: number) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(time);
const shortDay = (date: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: zone, month: 'short', day: 'numeric',
}).format(new Date(`${date}T12:00:00+05:00`));

/** Rolling 7/30 × 24-hour windows, with calendar-day chart buckets in Pakistan time.
 * Two partial boundary days may therefore produce 8/31 chart buckets.
 * Drafts never count as outreach; recorded messages are not provider-confirmed sends.
 */
export function buildReport(state: WorkspaceState, period: 'week' | 'month', now = Date.now()): OutreachReport {
  if (!Number.isFinite(now)) throw new Error('A valid report end time is required.');
  const days = period === 'week' ? 7 : 30;
  const start = now - days * DAY;
  const inWindow = (createdAt: string) => {
    const time = Date.parse(createdAt);
    return Number.isFinite(time) && time >= start && time <= now;
  };
  const sent = state.messages.filter(m => m.direction === 'outbound' && m.status === 'logged' && inWindow(m.createdAt));
  const replies = state.messages.filter(m => m.direction === 'inbound' && m.status === 'received' && inWindow(m.createdAt));
  const leads = state.leads.filter(l => inWindow(l.createdAt));

  const rate = (memberId?: string) => {
    const outbound = sent.filter(m => !memberId || m.memberId === memberId);
    const firstContact = new Map<string, number>();
    for (const message of outbound) {
      const time = Date.parse(message.createdAt);
      firstContact.set(message.leadId, Math.min(firstContact.get(message.leadId) ?? Infinity, time));
    }
    const replied = new Set(replies.filter(m => {
      const contactTime = firstContact.get(m.leadId);
      return contactTime !== undefined && Date.parse(m.createdAt) >= contactTime;
    }).map(m => m.leadId));
    return firstContact.size ? Math.round(replied.size / firstContact.size * 100) : 0;
  };

  const buckets = new Map<string, OutreachReport['daily'][number]>();
  const addDay = (time: number) => {
    const date = localDay(time);
    if (!buckets.has(date)) buckets.set(date, { date, label: shortDay(date), sent: 0, replies: 0, leads: 0 });
  };
  for (let time = start; time <= now; time += DAY) addDay(time);
  addDay(now);
  for (const message of sent) buckets.get(localDay(Date.parse(message.createdAt)))!.sent += 1;
  for (const message of replies) buckets.get(localDay(Date.parse(message.createdAt)))!.replies += 1;
  for (const lead of leads) buckets.get(localDay(Date.parse(lead.createdAt)))!.leads += 1;

  return {
    period, days, start: new Date(start).toISOString(), end: new Date(now).toISOString(),
    timezone: zone, label: `Last ${days} days`, sent: sent.length, replies: replies.length,
    leads: leads.length, replyRate: rate(),
    members: state.members.map(member => ({
      memberId: member.id, name: member.name, role: member.role,
      sent: sent.filter(m => m.memberId === member.id).length,
      replies: replies.filter(m => m.memberId === member.id).length,
      leads: leads.filter(l => l.ownerId === member.id).length,
      replyRate: rate(member.id),
    })),
    daily: [...buckets.values()],
  };
}

/** Escape spreadsheet formulas as well as quotes, commas, and multiline text. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function reportToCsv(report: OutreachReport): string {
  const rows: unknown[][] = [
    ['Highlevel Leads outreach report', report.label],
    ['Window start (UTC)', report.start],
    ['Window end (UTC)', report.end],
    ['Chart timezone', report.timezone],
    ['Outreach source', 'Manually logged outreach; drafts excluded'],
    ['Reply rate', 'Unique contacted leads with a subsequent recorded reply in the same window / unique contacted leads'],
    [],
    ['Team member', 'Role', 'New leads', 'Logged outreach', 'Recorded replies', 'Reply rate (%)'],
    ...report.members.map(m => [m.name, m.role, m.leads, m.sent, m.replies, m.replyRate]),
    ['Workspace total', '', report.leads, report.sent, report.replies, report.replyRate],
    [],
    ['Date (Asia/Karachi)', 'New leads', 'Logged outreach', 'Recorded replies'],
    ...report.daily.map(d => [d.date, d.leads, d.sent, d.replies]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
