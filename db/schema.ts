import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { Lead, Audit, Message, SocialAccount, MemberPermissions } from '../lib/domain';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull().unique(), createdAt: text('created_at').notNull(),
});
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id').unique(), authUserId:text('auth_user_id').unique(), name: text('name').notNull(), email: text('email').notNull().unique(),
  role: text('role', {enum:['admin','member']}).notNull(), status: text('status',{enum:['active','invited','suspended','removed']}).notNull(),
  permissions:text('permissions',{mode:'json'}).$type<MemberPermissions>(), createdAt: text('created_at').notNull(),
}, t => [index('members_workspace_idx').on(t.workspaceId)]);
export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  ownerId: text('owner_id').notNull().references(() => members.id), data: text('data',{mode:'json'}).$type<Lead>().notNull(),
}, t => [index('leads_workspace_owner_idx').on(t.workspaceId,t.ownerId)]);
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  leadId: text('lead_id').notNull().references(() => leads.id), memberId: text('member_id').notNull().references(() => members.id),
  data: text('data',{mode:'json'}).$type<Message>().notNull(),
}, t => [index('messages_workspace_idx').on(t.workspaceId)]);
export const audits = sqliteTable('audits', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  leadId: text('lead_id').notNull().references(() => leads.id), data: text('data',{mode:'json'}).$type<Audit>().notNull(),
}, t => [index('audits_workspace_idx').on(t.workspaceId)]);
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(), detail: text('detail').notNull(), leadId: text('lead_id'),
  read: integer('read',{mode:'boolean'}).notNull().default(false), createdAt: text('created_at').notNull(),
}, t => [index('notifications_workspace_idx').on(t.workspaceId)]);
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  memberId: text('member_id').notNull().references(() => members.id), platform: text('platform').notNull(),
  data: text('data',{mode:'json'}).$type<SocialAccount>().notNull(),
}, t => [uniqueIndex('account_member_platform_idx').on(t.memberId,t.platform)]);

// Better Auth's dedicated credential/session records. Application memberships
// remain separate and are checked on every workspace operation.
export const authUser=sqliteTable('auth_user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),
 emailVerified:integer('email_verified',{mode:'boolean'}).notNull(),image:text('image'),
 createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
});
export const authSession=sqliteTable('auth_session',{
 id:text('id').primaryKey(),expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),token:text('token').notNull().unique(),
 createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
 ipAddress:text('ip_address'),userAgent:text('user_agent'),userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),
},t=>[index('auth_session_user_idx').on(t.userId)]);
export const authAccount=sqliteTable('auth_account',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),
 userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),
 accessTokenExpiresAt:integer('access_token_expires_at',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refresh_token_expires_at',{mode:'timestamp_ms'}),scope:text('scope'),password:text('password'),
 createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('auth_account_user_idx').on(t.userId)]);
export const authVerification=sqliteTable('auth_verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),
 createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('auth_verification_identifier_idx').on(t.identifier)]);
export const authRateLimit=sqliteTable('auth_rate_limit',{
 id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('last_request').notNull(),
});
export const accountLinks=sqliteTable('account_links',{
 id:text('id').primaryKey(),memberId:text('member_id').notNull().references(()=>members.id),tokenHash:text('token_hash').notNull().unique(),
 kind:text('kind',{enum:['activate','reset']}).notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),usedAt:text('used_at'),
},t=>[index('account_links_member_idx').on(t.memberId)]);
