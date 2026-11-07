import {z,ZodError} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {requireWorkspace,requireLeadAccess,storeAudit,snapshot,mergeDiscoveredLinks} from '../../../lib/server-workspace';
import {assertSameOrigin,assertPermission,WorkspaceError} from '../../../lib/workspace-policy';
import {auditWebsite} from '../../../lib/seo-audit';
export const dynamic='force-dynamic';
const input=z.object({leadId:z.string().min(1).max(100),type:z.enum(['SEO','AI visibility','Google Business']),summary:z.string().trim().max(2000).nullable().optional(),evidence:z.string().trim().max(10000).nullable().optional()}).strict();
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 try{
  assertSameOrigin(request);
  const user=await getChatGPTUser();if(!user)return json({error:'Please sign in to run an audit.'},401);
  const raw=await request.text();if(raw.length>16000)return json({error:'Audit request is too large.'},413);
  const body=input.parse(JSON.parse(raw));
  const ctx=await requireWorkspace(user);
  assertPermission({...ctx.member,permissions:ctx.member.permissions??undefined},'audits');
  const lead=await requireLeadAccess(ctx,body.leadId);
  let audit;
  if(body.type==='SEO'){
   if(!lead.website)throw new WorkspaceError('Add an HTTPS website to this lead before running an audit.');
   const result=await auditWebsite(lead.website);
   audit=await storeAudit(ctx,{leadId:lead.id,type:'SEO',status:'complete',score:result.score,summary:`${result.summary} Source: ${result.finalUrl}`,checks:result.checks});
   if(Object.keys(result.socialLinks).length)await mergeDiscoveredLinks(ctx,lead.id,result.socialLinks);
  }else{
   if(!body.summary||!body.evidence)throw new WorkspaceError('Add both an observation summary and supporting evidence.');
   audit=await storeAudit(ctx,{leadId:lead.id,type:body.type,status:'manual',score:null,summary:body.summary,checks:[{label:'Manually recorded observation',status:'unknown',detail:body.evidence}]});
  }
  return json({audit,state:await snapshot(user)});
 }catch(e){
  if(e instanceof WorkspaceError)return json({error:e.message},e.status);
  if(e instanceof ZodError)return json({error:e.issues[0]?.message||'Invalid audit request.'},400);
  if(e instanceof SyntaxError)return json({error:'Invalid JSON request.'},400);
  return json({error:e instanceof Error?e.message:'The audit could not be completed.'},422);
 }
}
