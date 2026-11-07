import {and,eq,gt,isNull,or} from 'drizzle-orm';
import {hashPassword} from 'better-auth/crypto';
import {getDb} from '../db';
import * as tables from '../db/schema';
import type {AppUser} from './auth';
import type {createPasswordAuth} from './auth-config';
import {requireWorkspace,snapshot,mutateWorkspace} from './server-workspace';
import {assertAdmin,WorkspaceError} from './workspace-policy';

type PasswordAuth=ReturnType<typeof createPasswordAuth>;
export function validateNewPassword(password:string){if(password.length<12||password.length>128)throw new WorkspaceError('Use a password between 12 and 128 characters.');}
export async function tokenHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function newToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');}

async function provisionPasswordAccount(member:typeof tables.members.$inferSelect,password:string,auth:PasswordAuth){
 const db=getDb();
 const result=await auth.api.signUpEmail({body:{name:member.name,email:member.email,password}});
 const authId=result.user.id;
 const bound=await db.update(tables.members).set({authUserId:authId,userId:member.userId||`auth:${authId}`,status:'active'})
  .where(and(eq(tables.members.id,member.id),isNull(tables.members.authUserId),or(eq(tables.members.status,'invited'),eq(tables.members.status,'active')))).returning({id:tables.members.id});
 if(!bound.length){
  await db.batch([db.delete(tables.authAccount).where(eq(tables.authAccount.userId,authId)),db.delete(tables.authUser).where(eq(tables.authUser.id,authId))]);
  throw new WorkspaceError('Account access changed during setup. Contact your admin.',409);
 }
 return authId;
}
export async function setupOwnerPassword(user:AppUser,password:string,allowedEmail:string,auth:PasswordAuth){
 validateNewPassword(password);
 if(!allowedEmail||user.email.toLowerCase()!==allowedEmail.toLowerCase())throw new WorkspaceError('Only the configured workspace owner can initialize the admin account.',403);
 if(!(await snapshot(user)).workspace)await mutateWorkspace(user,{action:'createWorkspace',name:'Highlevel Leads'});
 const ctx=await requireWorkspace(user);
 if(ctx.workspace.ownerUserId!==user.userId)throw new WorkspaceError('Only the workspace owner can initialize admin access.',403);
 if(ctx.member.authUserId)throw new WorkspaceError('Your password account is already set up. Sign in or request an owner recovery link.',409);
 const authId=await provisionPasswordAccount(ctx.member,password,auth);
 await ctx.db.update(tables.authUser).set({emailVerified:true}).where(eq(tables.authUser.id,authId));
}
export async function createAccountLink(user:AppUser,targetId:string,kind:'activate'|'reset',origin:string){
 const ctx=await requireWorkspace(user);assertAdmin(ctx.member);
 const target=await ctx.db.select().from(tables.members).where(and(eq(tables.members.id,targetId),eq(tables.members.workspaceId,ctx.workspace.id))).get();
 if(!target)throw new WorkspaceError('Team member not found.',404);
 if(target.status==='suspended'||target.status==='removed')throw new WorkspaceError('Restore account access before creating an account link.');
 if(target.role==='admin'&&ctx.member.userId!==ctx.workspace.ownerUserId&&target.id!==ctx.member.id)throw new WorkspaceError('Only the owner can reset another admin account.',403);
 if(kind==='activate'&&target.authUserId)throw new WorkspaceError('This account is already set up. Create a recovery link instead.');
 if(kind==='reset'&&!target.authUserId)throw new WorkspaceError('This member needs an activation link first.');
 const token=newToken(),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+(kind==='activate'?24:1)*60*60*1000).toISOString();
 await ctx.db.batch([
  ctx.db.update(tables.accountLinks).set({usedAt:createdAt}).where(and(eq(tables.accountLinks.memberId,targetId),isNull(tables.accountLinks.usedAt))),
  ctx.db.insert(tables.accountLinks).values({id:crypto.randomUUID(),memberId:targetId,kind,tokenHash:await tokenHash(token),createdAt,expiresAt}),
 ]);
 return {url:`${origin}/activate#token=${token}`,expiresAt,kind};
}
export async function redeemAccountLink(token:string,password:string,auth:PasswordAuth){
 validateNewPassword(password);
 if(!/^[a-f0-9]{64}$/.test(token))throw new WorkspaceError('This link is invalid, expired, or already used.');
 const db=getDb(),now=new Date().toISOString();
 const link=await db.select().from(tables.accountLinks).where(and(eq(tables.accountLinks.tokenHash,await tokenHash(token)),isNull(tables.accountLinks.usedAt),gt(tables.accountLinks.expiresAt,now))).get();
 if(!link)throw new WorkspaceError('This link is invalid, expired, or already used.');
 const member=await db.select().from(tables.members).where(eq(tables.members.id,link.memberId)).get();
 if(!member||member.status==='suspended'||member.status==='removed')throw new WorkspaceError('Account access is not active. Contact your admin.',403);
 const claimed=await db.update(tables.accountLinks).set({usedAt:now}).where(and(eq(tables.accountLinks.id,link.id),isNull(tables.accountLinks.usedAt),gt(tables.accountLinks.expiresAt,now))).returning({id:tables.accountLinks.id});
 if(!claimed.length)throw new WorkspaceError('This link is invalid, expired, or already used.');
 if(link.kind==='activate'){
  if(member.authUserId)throw new WorkspaceError('This account is already set up.');
  await provisionPasswordAccount(member,password,auth);
 }else{
  if(!member.authUserId)throw new WorkspaceError('Account setup is incomplete. Contact your admin.');
  const hashed=await hashPassword(password);
  await db.batch([
   db.update(tables.authAccount).set({password:hashed,updatedAt:new Date()}).where(and(eq(tables.authAccount.userId,member.authUserId),eq(tables.authAccount.providerId,'credential'))),
   db.delete(tables.authSession).where(eq(tables.authSession.userId,member.authUserId)),
   db.update(tables.accountLinks).set({usedAt:now}).where(and(eq(tables.accountLinks.memberId,member.id),isNull(tables.accountLinks.usedAt))),
  ]);
 }
 return {ok:true};
}
