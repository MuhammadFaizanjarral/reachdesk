import type { Member, MemberPermissions } from './domain';

export const defaultMemberPermissions:MemberPermissions = {
  leadFinder:true, createLeads:true, editLeads:true, outreach:true,
  audits:true, reports:true, exports:false, socialAccounts:true,
};
export const permissionLabels:Record<keyof MemberPermissions,string> = {
  leadFinder:'Lead finder', createLeads:'Add new leads', editLeads:'Edit assigned leads',
  outreach:'Inbox and outreach', audits:'View and run audits', reports:'View own reports',
  exports:'Download data exports', socialAccounts:'Manage own social profiles',
};
export function permissionsFor(member:Pick<Member,'role'|'permissions'>|null|undefined):MemberPermissions {
  if(member?.role==='admin') return Object.fromEntries(Object.keys(defaultMemberPermissions).map(key=>[key,true])) as MemberPermissions;
  if(!member) return Object.fromEntries(Object.keys(defaultMemberPermissions).map(key=>[key,false])) as MemberPermissions;
  return {...defaultMemberPermissions,...member.permissions};
}
