import { z } from 'zod';
import type { Member, MemberPermissions } from './domain';
import { permissionsFor } from './permissions.ts';

export class WorkspaceError extends Error {
  constructor(message:string, public status = 400) { super(message); this.name = 'WorkspaceError'; }
}
export const idSchema = z.string().min(1).max(100);
export const platformSchema = z.enum(['Instagram','Facebook','LinkedIn','X','Website']);
export const publicUrlSchema = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const u=new URL(value); return (u.protocol==='https:' || u.protocol==='http:') && !u.username && !u.password; } catch { return false; }
}, 'Enter a complete http:// or https:// URL.');
const smallText = z.string().trim().max(200);
export const permissionsSchema=z.object({leadFinder:z.boolean(),createLeads:z.boolean(),editLeads:z.boolean(),outreach:z.boolean(),audits:z.boolean(),reports:z.boolean(),exports:z.boolean(),socialAccounts:z.boolean()}).strict();
const leadInput = z.object({
  name:smallText.min(1), company:smallText.min(1), industry:smallText.default(''), location:smallText.default(''),
  website:publicUrlSchema.default(''), email:z.union([z.literal(''),z.string().email().max(254)]).default(''),
  platform:platformSchema.default('Instagram'), profileUrl:publicUrlSchema.default(''),
  socialLinks:z.record(z.string().max(50),publicUrlSchema).refine(v=>Object.keys(v).length<=12,'Too many social profiles.').default({}),
  ownerId:idSchema.optional(), notes:z.string().trim().max(10000).default(''),
}).strict();
export const actionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('createWorkspace'),name:z.string().trim().min(1).max(100)}).strict(),
  z.object({action:z.literal('addLead'),lead:leadInput}).strict(),
  z.object({action:z.literal('updateLead'),id:idSchema,changes:z.object({website:publicUrlSchema.optional(),status:z.enum(['New','Contacted','Replied','Qualified','Won']).optional(),ownerId:idSchema.optional(),notes:z.string().trim().max(10000).optional()}).strict()}).strict(),
  z.object({action:z.literal('inviteMember'),name:smallText.min(1),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),role:z.enum(['admin','member']),permissions:permissionsSchema.optional()}).strict(),
  z.object({action:z.literal('setMemberPermissions'),id:idSchema,permissions:permissionsSchema}).strict(),
  z.object({action:z.literal('setMemberStatus'),id:idSchema,status:z.enum(['active','suspended','removed'])}).strict(),
  z.object({action:z.literal('saveMessage'),leadId:idSchema,platform:platformSchema,body:z.string().trim().min(1).max(10000),status:z.enum(['draft','logged']).default('draft'),direction:z.enum(['outbound','inbound']).default('outbound')}).strict(),
  z.object({action:z.literal('readNotifications')}).strict(),
  z.object({action:z.literal('saveAccount'),platform:platformSchema,handle:smallText.min(1),profileUrl:publicUrlSchema.refine(v=>!!v,'A profile URL is required.')}).strict(),
]);
export type WorkspaceAction = z.infer<typeof actionSchema>;
export function assertAdmin(member:Pick<Member,'role'>) { if(member.role!=='admin') throw new WorkspaceError('Only workspace admins can perform this action.',403); }
export function assertPermission(member:Pick<Member,'role'|'permissions'>,permission:keyof MemberPermissions) {
  if(!permissionsFor(member)[permission]) throw new WorkspaceError('Your admin has restricted this feature. Contact your admin for access.',403);
}
export function assertLeadOwner(member:Pick<Member,'role'|'id'>,ownerId:string) { if(member.role!=='admin' && member.id!==ownerId) throw new WorkspaceError('This lead is not assigned to you.',403); }
export function assertSameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(!origin || origin!==new URL(request.url).origin) throw new WorkspaceError('This request must come from this workspace.',403);
}
