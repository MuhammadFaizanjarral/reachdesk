import type {WorkspaceState} from './domain';
import type {ChatGPTUser} from '../app/chatgpt-auth';
import {requireWorkspace,snapshot} from './server-workspace';
import {assertPermission} from './workspace-policy';
import {buildReport,csvCell,reportToCsv} from './reporting';
export async function authorizedReport(user:ChatGPTUser,period:'week'|'month') {
  const ctx=await requireWorkspace(user);
  assertPermission({...ctx.member,permissions:ctx.member.permissions??undefined},'reports');
  return buildReport(await snapshot(user),period);
}
export type ExportFilters={q?:string;platform?:string;status?:string;industry?:string;location?:string};
export function leadCsv(state:WorkspaceState,filters:ExportFilters={}) {
  const matching=state.leads.filter(l=>(!filters.q||`${l.name} ${l.company} ${l.email}`.toLowerCase().includes(filters.q.toLowerCase()))
    &&(!filters.platform||filters.platform==='All platforms'||l.platform===filters.platform)
    &&(!filters.status||filters.status==='All statuses'||l.status===filters.status)
    &&(!filters.industry||l.industry.toLowerCase().includes(filters.industry.toLowerCase()))
    &&(!filters.location||l.location.toLowerCase().includes(filters.location.toLowerCase())));
  return [['Name','Company','Industry','Location','Website','Email','Platform','Profile','Status','Owner'],...matching.map(l=>[l.name,l.company,l.industry,l.location,l.website,l.email,l.platform,l.profileUrl,l.status,state.members.find(m=>m.id===l.ownerId)?.name||'Unassigned'])].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export async function authorizedExport(user:ChatGPTUser,type:'leads'|'report',period:'week'|'month',filters:ExportFilters={}) {
  const ctx=await requireWorkspace(user);
  const actor={...ctx.member,permissions:ctx.member.permissions??undefined};
  assertPermission(actor,'exports');
  if(type==='report')assertPermission(actor,'reports');
  const state=await snapshot(user);
  return type==='report'?reportToCsv(buildReport(state,period)):leadCsv(state,filters);
}
