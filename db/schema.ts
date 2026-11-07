import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { Lead, Audit, Message, SocialAccount, MemberPermissions } from '../lib/domain';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull().unique(), createdAt: text('created_at').notNull(),
});
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id').unique(), name: text('name').notNull(), email: text('email').notNull().unique(),
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
