import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, csvCell, reportToCsv } from '../lib/reporting.ts';
import { createDemoState, applyDemoAction } from '../lib/demo-data.ts';
import type { WorkspaceState, Message } from '../lib/domain';

const now = Date.parse('2026-11-07T22:00:00Z');
const DAY = 86_400_000;
const iso = (offset: number) => new Date(now - offset * DAY).toISOString();
function fixture(): WorkspaceState {
  return {
    workspace:{id:'w',name:'Test'},currentMember:null,
    members:[{id:'a',userId:'user-a',name:'Maya',email:'maya@test.example',role:'admin',status:'active',createdAt:iso(40)}],
    leads:[{id:'lead-a',name:'Person',company:'Example',industry:'Design',location:'Karachi',website:'https://company.example',email:'',platform:'Instagram',profileUrl:'',socialLinks:{},status:'New',ownerId:'a',notes:'',createdAt:iso(1)}],
    messages:[],audits:[],notifications:[],accounts:[],
  };
}
function message(id: string, offset: number, overrides: Partial<Message> = {}): Message {
  return {id,leadId:'lead-a',memberId:'a',platform:'Instagram',body:'Example',direction:'outbound',status:'logged',createdAt:iso(offset),...overrides};
}

test('rolling report includes exact boundaries and excludes drafts, future and invalid records', () => {
  const state = fixture();
  state.messages = [message('at-start',7),message('at-end',0),message('old',7.00001),message('future',-0.01),message('draft',1,{status:'draft'}),message('invalid',1,{createdAt:'bad'})];
  const report = buildReport(state,'week',now);
  assert.equal(report.sent,2);
  assert.equal(report.leads,1);
  assert.equal(report.start,iso(7));
  assert.equal(report.members[0].sent,2);
  assert.equal(report.daily.reduce((sum,d) => sum + d.sent,0),2);
});

test('reply rate is deduplicated and only counts replies after contact', () => {
  const state = fixture();
  state.messages = [
    message('contact',3),message('follow-up',2),
    message('reply',1,{direction:'inbound',status:'received'}),
    message('reply-again',0.5,{direction:'inbound',status:'received'}),
    message('other-contact',1,{leadId:'lead-b'}),
    message('older-reply',2,{leadId:'lead-b',direction:'inbound',status:'received'}),
  ];
  const report = buildReport(state,'week',now);
  assert.equal(report.sent,3);
  assert.equal(report.replies,3);
  assert.equal(report.replyRate,50);
  assert.equal(report.members[0].replyRate,50);
});

test('empty report does not divide by zero and chart uses Asia/Karachi dates', () => {
  const state = fixture();
  state.messages = [message('late-utc',0)];
  const report = buildReport(state,'month',now);
  assert.equal(report.daily.at(-1)?.date,'2026-11-08');
  assert.equal(report.daily.at(-1)?.sent,1);
  assert.equal(report.timezone,'Asia/Karachi');
  assert.equal(report.replyRate,0);
  assert.equal(buildReport({...state,messages:[]},'week',now).replyRate,0);
});

test('CSV protects formulas and preserves multiline values and embedded quotes', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('  +cmd'),'"\'  +cmd"');
  assert.equal(csvCell('@SUM(1,2)'),'"\'@SUM(1,2)"');
  assert.equal(csvCell('\tformula'),'"\'\tformula"');
  assert.equal(csvCell('normal,"value"\nline'),'"normal,""value""\nline"');
  const state = fixture();
  state.members[0].name = '=1+1';
  const csv = reportToCsv(buildReport(state,'week',now));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('Manually logged outreach; drafts excluded'));
});

test('sample workspace is fictional and sample actions do not mutate their input', () => {
  const state = createDemoState();
  assert.equal(state.leads.length,16);
  assert.ok(state.leads.every(l => new URL(l.website).hostname.endsWith('.example')));
  assert.ok(state.accounts.every(a => a.status === 'profile_saved'));
  const before = JSON.stringify(state);
  const next = applyDemoAction(state,{action:'saveMessage',leadId:state.leads[0].id,body:'A manually logged sample reply.',direction:'inbound',platform:'Instagram'});
  assert.equal(JSON.stringify(state),before);
  assert.equal(next.messages.length,state.messages.length + 1);
  assert.equal(next.messages.at(-1)?.status,'received');
  assert.match(next.notifications[0].detail,/manually recorded/);
});

test('sample member cannot reassign or write to another member’s lead', () => {
  const state = createDemoState();
  state.currentMember = state.members[1];
  const otherLead = state.leads.find(l => l.ownerId !== state.currentMember!.id)!;
  assert.throws(() => applyDemoAction(state,{action:'updateLead',id:otherLead.id,changes:{status:'Won'}}),/Lead not found/);
  const ownedLead = state.leads.find(l => l.ownerId === state.currentMember!.id)!;
  assert.throws(() => applyDemoAction(state,{action:'updateLead',id:ownedLead.id,changes:{ownerId:state.members[0].id}}),/Only admins/);
});
