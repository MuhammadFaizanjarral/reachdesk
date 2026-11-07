import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import * as tables from '../db/schema';
import type {AppUser} from './auth';
import {defaultMemberPermissions,permissionsFor} from './permissions';
import { emptyState, type Audit, type Lead, type Member, type Message, type SocialAccount, type WorkspaceState } from './domain';
import { assertAdmin, assertPermission, assertLeadOwner, type WorkspaceAction, WorkspaceError, publicUrlSchema } from './workspace-policy';

export type WorkspaceContext = { db: ReturnType<typeof getDb>; member:typeof tables.members.$inferSelect; workspace:typeof tables.workspaces.$inferSelect };
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
function isUniqueViolation(error:unknown):boolean {
  let current=error;
  for(let depth=0; depth<4 && current; depth++) {
    if(String(current).includes('UNIQUE constraint')) return true;
    current=current instanceof Error?current.cause:null;
  }
  return false;
}

async function findMembership(user:AppUser) {
  const db=getDb();
  const existing=await db.select().from(tables.members).where(eq(tables.members.userId,user.userId)).get();
  if(existing) {
    if(existing.status==='suspended'||existing.status==='removed') throw new WorkspaceError('Your workspace access has been '+existing.status+'. Contact your admin.',403);
    return existing;
  }
  const invitation=await db.select().from(tables.members).where(eq(tables.members.email,user.email.toLowerCase())).get();
  if(invitation && (invitation.status==='suspended'||invitation.status==='removed')) throw new WorkspaceError('Your workspace access has been '+invitation.status+'. Contact your admin.',403);
  if(invitation?.status==='invited' && !invitation.userId) {
    await db.update(tables.members).set({userId:user.userId,status:'active'}).where(and(eq(tables.members.id,invitation.id),eq(tables.members.status,'invited')));
    return await db.select().from(tables.members).where(eq(tables.members.userId,user.userId)).get();
  }
  return null;
}
export async function requireWorkspace(user:AppUser):Promise<WorkspaceContext> {
  const db=getDb(); const member=await findMembership(user);
  if(!member) throw new WorkspaceError('Create a workspace or ask your admin to add your sign-in email.',404);
  const workspace=await db.select().from(tables.workspaces).where(eq(tables.workspaces.id,member.workspaceId)).get();
  if(!workspace) throw new WorkspaceError('Workspace not found.',404);
  return {db,member,workspace};
}
export async function requireLeadAccess(ctx:WorkspaceContext,leadId:string):Promise<Lead> {
  const row=await ctx.db.select().from(tables.leads).where(and(eq(tables.leads.id,leadId),eq(tables.leads.workspaceId,ctx.workspace.id))).get();
  if(!row) throw new WorkspaceError('Lead not found.',404);
  assertLeadOwner(ctx.member,row.ownerId); return row.data;
}
function displayMember(row:typeof tables.members.$inferSelect):Member {
  return {id:row.id,userId:row.userId,name:row.name,email:row.email,role:row.role,status:row.status,accountReady:!!row.authUserId,permissions:permissionsFor({...row,permissions:row.permissions??undefined}),createdAt:row.createdAt};
}
export async function snapshot(user:AppUser):Promise<WorkspaceState> {
  const member=await findMembership(user);
  if(!member) return {...emptyState};
  const db=getDb(); const workspace=await db.select().from(tables.workspaces).where(eq(tables.workspaces.id,member.workspaceId)).get();
  if(!workspace) throw new WorkspaceError('Workspace not found.',404);
  const admin=member.role==='admin';
  const permissions=permissionsFor({...member,permissions:member.permissions??undefined});
  const visibleLeads=await db.select().from(tables.leads).where(admin?eq(tables.leads.workspaceId,workspace.id):and(eq(tables.leads.workspaceId,workspace.id),eq(tables.leads.ownerId,member.id)));
  const [memberRows,messageRows,auditRows,notificationRows,accountRows]=await Promise.all([
    db.select().from(tables.members).where(admin?eq(tables.members.workspaceId,workspace.id):eq(tables.members.id,member.id)),
    db.select({data:tables.messages.data}).from(tables.messages).innerJoin(tables.leads,eq(tables.messages.leadId,tables.leads.id)).where(and(eq(tables.messages.workspaceId,workspace.id),eq(tables.leads.workspaceId,workspace.id),admin?undefined:eq(tables.leads.ownerId,member.id))),
    db.select({data:tables.audits.data}).from(tables.audits).innerJoin(tables.leads,eq(tables.audits.leadId,tables.leads.id)).where(and(eq(tables.audits.workspaceId,workspace.id),eq(tables.leads.workspaceId,workspace.id),admin?undefined:eq(tables.leads.ownerId,member.id))),
    admin?db.select().from(tables.notifications).where(eq(tables.notifications.workspaceId,workspace.id)):Promise.resolve([]),
    db.select().from(tables.accounts).where(admin?eq(tables.accounts.workspaceId,workspace.id):and(eq(tables.accounts.workspaceId,workspace.id),eq(tables.accounts.memberId,member.id))),
  ]);
  return {workspace:{id:workspace.id,name:workspace.name},currentMember:displayMember(member),members:memberRows.map(displayMember),
    leads:visibleLeads.map(v=>v.data).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    messages:(permissions.outreach?messageRows:[]).map(v=>v.data).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),
    audits:(permissions.audits?auditRows:[]).map(v=>v.data).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    notifications:notificationRows.map(v=>({id:v.id,title:v.title,detail:v.detail,leadId:v.leadId??undefined,read:v.read,createdAt:v.createdAt})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    accounts:(permissions.socialAccounts?accountRows:[]).map(v=>v.data)};
}
async function validateOwner(ctx:WorkspaceContext,ownerId:string) {
  const row=await ctx.db.select().from(tables.members).where(and(eq(tables.members.id,ownerId),eq(tables.members.workspaceId,ctx.workspace.id))).get();
  if(!row || row.status==='suspended' || row.status==='removed') throw new WorkspaceError('Select an active or invited member of this workspace.',400);
  if(ctx.member.role!=='admin' && ownerId!==ctx.member.id) throw new WorkspaceError('Only admins can assign leads to another member.',403);
}
export async function mutateWorkspace(user:AppUser,action:WorkspaceAction):Promise<WorkspaceState> {
  if(action.action==='createWorkspace') {
    if(await findMembership(user)) throw new WorkspaceError('You already belong to a workspace.',409);
    const db=getDb(), workspaceId=id(), createdAt=now();
    try {
      await db.batch([
        db.insert(tables.workspaces).values({id:workspaceId,name:action.name,ownerUserId:user.userId,createdAt}),
        db.insert(tables.members).values({id:id(),workspaceId,userId:user.userId,name:user.fullName||user.email.split('@')[0],email:user.email.toLowerCase(),role:'admin',status:'active',createdAt}),
      ]);
    } catch(error) { if(isUniqueViolation(error)) throw new WorkspaceError('This account already belongs to a workspace. Refresh to continue.',409); throw error; }
    return snapshot(user);
  }
  const ctx=await requireWorkspace(user); const {db,workspace,member}=ctx;
  if(action.action==='addLead') {
    assertPermission({...member,permissions:member.permissions??undefined},'createLeads');
    const ownerId=action.lead.ownerId||member.id; await validateOwner(ctx,ownerId);
    const lead:Lead={...action.lead,ownerId,id:id(),status:'New',createdAt:now()};
    await db.insert(tables.leads).values({id:lead.id,workspaceId:workspace.id,ownerId,data:lead});
  } else if(action.action==='updateLead') {
    assertPermission({...member,permissions:member.permissions??undefined},'editLeads');
    const lead=await requireLeadAccess(ctx,action.id);
    if(action.changes.ownerId) await validateOwner(ctx,action.changes.ownerId);
    const patches=Object.entries(action.changes).filter(([,value])=>value!==undefined).map(([key,value])=>sql`${`$.${key}`}, ${value}`);
    if(patches.length) {
      const changed=await db.update(tables.leads).set({
        ...(action.changes.ownerId?{ownerId:action.changes.ownerId}:{}),
        data:sql<Lead>`json_set(${tables.leads.data}, ${sql.join(patches,sql`, `)})`,
      }).where(and(eq(tables.leads.id,lead.id),eq(tables.leads.workspaceId,workspace.id),member.role==='admin'?undefined:eq(tables.leads.ownerId,member.id))).returning({id:tables.leads.id});
      if(!changed.length) throw new WorkspaceError('This lead was reassigned. Refresh your workspace.',409);
    }
  } else if(action.action==='inviteMember') {
    assertAdmin(member);
    try { await db.insert(tables.members).values({id:id(),workspaceId:workspace.id,userId:null,name:action.name,email:action.email,role:action.role,status:'invited',permissions:action.permissions??defaultMemberPermissions,createdAt:now()}); }
    catch(error) { if(isUniqueViolation(error)) throw new WorkspaceError('That email already has a workspace membership or invitation.',409); throw error; }
  } else if(action.action==='setMemberPermissions' || action.action==='setMemberStatus') {
    assertAdmin(member);
    const target=await db.select().from(tables.members).where(and(eq(tables.members.id,action.id),eq(tables.members.workspaceId,workspace.id))).get();
    if(!target) throw new WorkspaceError('Team member not found.',404);
    if(target.id===member.id || target.userId===workspace.ownerUserId) throw new WorkspaceError('The workspace owner and your own admin access cannot be restricted here.',400);
    if(target.role==='admin' && member.userId!==workspace.ownerUserId) throw new WorkspaceError('Only the workspace owner can manage another admin.',403);
    if(action.action==='setMemberPermissions') {
      if(target.role==='admin') throw new WorkspaceError('Admins have full access. Permissions apply to team members.',400);
      await db.update(tables.members).set({permissions:action.permissions}).where(eq(tables.members.id,target.id));
    } else {
      const status=action.status==='active'&&!target.userId?'invited':action.status;
      if(action.status==='removed'||action.status==='suspended') {
        await db.batch([
          db.update(tables.members).set({status}).where(eq(tables.members.id,target.id)),
          db.update(tables.accountLinks).set({usedAt:now()}).where(eq(tables.accountLinks.memberId,target.id)),
          ...(target.authUserId?[db.delete(tables.authSession).where(eq(tables.authSession.userId,target.authUserId))]:[]),
          ...(action.status==='removed'?[db.update(tables.leads).set({ownerId:member.id,data:sql<Lead>`json_set(${tables.leads.data}, '$.ownerId', ${member.id})`}).where(and(eq(tables.leads.workspaceId,workspace.id),eq(tables.leads.ownerId,target.id)))]:[]),
        ]);
      } else await db.update(tables.members).set({status}).where(eq(tables.members.id,target.id));
    }
  } else if(action.action==='saveMessage') {
    assertPermission({...member,permissions:member.permissions??undefined},'outreach');
    const lead=await requireLeadAccess(ctx,action.leadId);
    const message:Message={id:id(),leadId:lead.id,memberId:member.id,platform:action.platform,body:action.body,direction:action.direction,status:action.direction==='inbound'?'received':action.status,createdAt:now()};
    // Recheck assignment inside the atomic batch. A reassignment between the
    // initial read and this write cannot let the previous owner write a message.
    const access=and(eq(tables.leads.id,lead.id),eq(tables.leads.workspaceId,workspace.id),member.role==='admin'?undefined:eq(tables.leads.ownerId,member.id));
    const insertMessage=db.insert(tables.messages).select(db.select({
      id:sql<string>`${message.id}`.as('id'), workspaceId:sql<string>`${workspace.id}`.as('workspace_id'),
      leadId:tables.leads.id, memberId:sql<string>`${member.id}`.as('member_id'),
      data:sql<Message>`${JSON.stringify(message)}`.as('data'),
    }).from(tables.leads).where(access)).returning({id:tables.messages.id});
    const nextStatus=action.direction==='inbound'?sql`'Replied'`:action.status==='logged'?sql`CASE WHEN json_extract(${tables.leads.data}, '$.status')='New' THEN 'Contacted' ELSE json_extract(${tables.leads.data}, '$.status') END`:sql`json_extract(${tables.leads.data}, '$.status')`;
    // Patch only status; never replace a lead with a stale in-memory copy.
    const updateStatus=db.update(tables.leads).set({data:sql<Lead>`json_set(${tables.leads.data}, '$.status', ${nextStatus})`}).where(access);
    let inserted;
    if(action.direction==='inbound') {
      const insertNotification=db.insert(tables.notifications).select(db.select({
        id:sql<string>`${id()}`.as('id'),workspaceId:sql<string>`${workspace.id}`.as('workspace_id'),
        title:sql<string>`${`Reply recorded · ${lead.company}`}`.as('title'),
        detail:sql<string>`${`${member.name} manually recorded a reply from ${lead.name} on ${action.platform}.`}`.as('detail'),
        leadId:tables.leads.id,read:sql<boolean>`0`.as('read'),createdAt:sql<string>`${now()}`.as('created_at'),
      }).from(tables.leads).where(access));
      [inserted]=await db.batch([insertMessage,updateStatus,insertNotification]);
    } else [inserted]=await db.batch([insertMessage,updateStatus]);
    if(!inserted.length) throw new WorkspaceError('This lead was reassigned. Refresh your workspace.',409);
  } else if(action.action==='readNotifications') {
    assertAdmin(member); await db.update(tables.notifications).set({read:true}).where(eq(tables.notifications.workspaceId,workspace.id));
  } else if(action.action==='saveAccount') {
    assertPermission({...member,permissions:member.permissions??undefined},'socialAccounts');
    const existing=await db.select().from(tables.accounts).where(and(eq(tables.accounts.memberId,member.id),eq(tables.accounts.platform,action.platform))).get();
    const account:SocialAccount={id:existing?.id||`${member.id}:${action.platform}`,memberId:member.id,platform:action.platform,handle:action.handle,profileUrl:action.profileUrl,status:'profile_saved'};
    await db.insert(tables.accounts).values({id:account.id,workspaceId:workspace.id,memberId:member.id,platform:account.platform,data:account}).onConflictDoUpdate({target:[tables.accounts.memberId,tables.accounts.platform],set:{data:account}});
  }
  return snapshot(user);
}
export async function storeAudit(ctx:WorkspaceContext,input:Omit<Audit,'id'|'createdAt'>):Promise<Audit> {
  assertPermission({...ctx.member,permissions:ctx.member.permissions??undefined},'audits');
  await requireLeadAccess(ctx,input.leadId);
  const audit:Audit={...input,id:id(),createdAt:now()};
  const inserted=await ctx.db.insert(tables.audits).select(ctx.db.select({
    id:sql<string>`${audit.id}`.as('id'), workspaceId:sql<string>`${ctx.workspace.id}`.as('workspace_id'),
    leadId:tables.leads.id, data:sql<Audit>`${JSON.stringify(audit)}`.as('data'),
  }).from(tables.leads).where(and(eq(tables.leads.id,audit.leadId),eq(tables.leads.workspaceId,ctx.workspace.id),ctx.member.role==='admin'?undefined:eq(tables.leads.ownerId,ctx.member.id)))).returning({id:tables.audits.id});
  if(!inserted.length) throw new WorkspaceError('This lead was reassigned. Refresh your workspace.',409);
  return audit;
}

export async function mergeDiscoveredLinks(ctx:WorkspaceContext,leadId:string,links:Record<string,string>):Promise<void> {
  await requireLeadAccess(ctx,leadId);
  const allowed=new Set(['Instagram','Facebook','LinkedIn','X','google']);
  const discovered=Object.fromEntries(Object.entries(links).filter(([key,value])=>allowed.has(key) && value && publicUrlSchema.safeParse(value).success));
  if(!Object.keys(discovered).length) return;
  const changed=await ctx.db.update(tables.leads).set({
    // Existing links win over discoveries. This reads the latest JSON atomically.
    data:sql<Lead>`json_set(${tables.leads.data}, '$.socialLinks', json_patch(json(${JSON.stringify(discovered)}), coalesce(json_extract(${tables.leads.data}, '$.socialLinks'), '{}')))`,
  }).where(and(eq(tables.leads.id,leadId),eq(tables.leads.workspaceId,ctx.workspace.id),ctx.member.role==='admin'?undefined:eq(tables.leads.ownerId,ctx.member.id))).returning({id:tables.leads.id});
  if(!changed.length) throw new WorkspaceError('This lead was reassigned. Refresh your workspace.',409);
}
