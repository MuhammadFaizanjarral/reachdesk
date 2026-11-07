// Runs the real workspace service against Drizzle + an in-memory SQLite D1 adapter.
// node --experimental-vm-modules --experimental-sqlite --test tests/workspace-isolation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';

const root=resolve(import.meta.dirname,'..');
let db;
let beforeBatch=null;
const modules=new Map();
async function loadModule(path) {
  if(modules.has(path)) return modules.get(path);
  if(path===resolve(root,'db')) {
    const mod=new SyntheticModule(['getDb'],function(){this.setExport('getDb',()=>db)});
    modules.set(path,mod); await mod.link(()=>{}); return mod;
  }
  if(!path.startsWith('/')) {
    const ns=await import(path); const mod=new SyntheticModule(Object.keys(ns),function(){for(const key of Object.keys(ns))this.setExport(key,ns[key]);});
    modules.set(path,mod); await mod.link(()=>{}); return mod;
  }
  const actual=extname(path)?path:`${path}.ts`;
  const text=await readFile(actual,'utf8');
  const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const mod=new SourceTextModule(code,{identifier:actual}); modules.set(path,mod);
  await mod.link((name)=>loadModule(name.startsWith('.')?resolve(dirname(actual),name):name)); return mod;
}
const serviceModule=await loadModule(resolve(root,'lib/server-workspace'));
await serviceModule.evaluate();
const service=serviceModule.namespace;
const schemaModule=await loadModule(resolve(root,'db/schema')); await schemaModule.evaluate();
const policyModule=await loadModule(resolve(root,'lib/workspace-policy')); await policyModule.evaluate();
function d1(sqlite) {
  const prepare=(sql)=>{
    let parameters=[];
    return { bind(...values){parameters=values;return this},
      async all(){return {results:sqlite.prepare(sql).all(...parameters),success:true}},
      async raw(){return sqlite.prepare(sql).all(...parameters).map(row=>Object.values(row))},
      async run(){const result=sqlite.prepare(sql).run(...parameters);return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}},
      _all(){return {results:sqlite.prepare(sql).all(...parameters),success:true}},
    };
  };
  return {prepare,async batch(statements){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook()}sqlite.exec('BEGIN');try{const results=statements.map(s=>s._all());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
}
async function setup() {
  const sqlite=new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  const files=(await readdir(resolve(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(files.length,'Run npm run db:generate before tests');
  for(const file of files)sqlite.exec(await readFile(resolve(root,'drizzle',file),'utf8'));
  db=drizzle(d1(sqlite),{schema:schemaModule.namespace});return sqlite;
}
const user=(name)=>({userId:`user-${name}`,email:`${name}@example.com`,fullName:name,displayName:name});
const mutate=(who,input)=>service.mutateWorkspace(who,policyModule.namespace.actionSchema.parse(input));

test('tenant isolation, team permissions, invitation binding, and reply notifications',async()=>{
  const sqlite=await setup();
  const admin=user('admin'), outsider=user('outsider'), teammate=user('teammate');
  assert.equal((await service.snapshot(admin)).workspace,null);
  let state=await mutate(admin,{action:'createWorkspace',name:'Acme'});
  const adminId=state.currentMember.id;
  await mutate(outsider,{action:'createWorkspace',name:'Other workspace'});
  state=await mutate(admin,{action:'inviteMember',name:'Teammate',email:teammate.email,role:'member'});
  const invited=state.members.find(m=>m.email===teammate.email);
  assert.equal(invited.status,'invited');
  const memberState=await service.snapshot(teammate);
  assert.equal(memberState.currentMember.id,invited.id);
  assert.equal(memberState.currentMember.status,'active');
  state=await mutate(admin,{action:'addLead',lead:{name:'Owner Lead',company:'Private Co',ownerId:adminId}});
  const adminLead=state.leads[0];
  state=await mutate(admin,{action:'addLead',lead:{name:'Team Lead',company:'Team Co',ownerId:invited.id}});
  const teamLead=state.leads.find(l=>l.ownerId===invited.id);
  assert.equal((await service.snapshot(teammate)).leads.length,1);
  assert.equal((await service.snapshot(outsider)).leads.length,0);
  await assert.rejects(mutate(teammate,{action:'updateLead',id:adminLead.id,changes:{status:'Won'}}),{status:403});
  await assert.rejects(mutate(outsider,{action:'updateLead',id:teamLead.id,changes:{status:'Won'}}),{status:404});
  await assert.rejects(mutate(teammate,{action:'inviteMember',name:'Bad',email:'bad@example.com',role:'admin'}),{status:403});
  await assert.rejects(mutate(teammate,{action:'updateLead',id:teamLead.id,changes:{ownerId:adminId}}),{status:403});
  await assert.rejects(mutate(teammate,{action:'readNotifications'}),{status:403});
  state=await mutate(teammate,{action:'saveMessage',leadId:teamLead.id,platform:'Instagram',body:'Draft only',status:'draft'});
  assert.equal(state.leads[0].status,'New');
  state=await mutate(teammate,{action:'saveMessage',leadId:teamLead.id,platform:'Instagram',body:'Recorded outreach',status:'logged'});
  assert.equal(state.leads[0].status,'Contacted');
  state=await mutate(teammate,{action:'saveMessage',leadId:teamLead.id,platform:'Instagram',body:'Interested',direction:'inbound',status:'logged'});
  assert.equal(state.leads[0].status,'Replied');
  assert.equal(state.notifications.length,0);
  const dashboard=await service.snapshot(admin);
  assert.equal(dashboard.notifications.length,1);
  assert.match(dashboard.notifications[0].detail,/manually recorded/);
  assert.equal(dashboard.messages.length,3);
  assert.equal((await service.snapshot(outsider)).messages.length,0);
  state=await mutate(teammate,{action:'saveAccount',platform:'Instagram',handle:'teammate',profileUrl:'https://instagram.com/teammate'});
  assert.equal(state.accounts[0].status,'profile_saved');
  assert.equal((await service.snapshot(outsider)).accounts.length,0);
  await assert.rejects(service.storeAudit(await service.requireWorkspace(outsider),{leadId:teamLead.id,type:'SEO',status:'complete',score:50,summary:'Test',checks:[]}),{status:404});
  sqlite.close();
});
test('concurrent workspace creation leaves one workspace and one membership',async()=>{
  const sqlite=await setup(), admin=user('race');
  const result=await Promise.allSettled([mutate(admin,{action:'createWorkspace',name:'First'}),mutate(admin,{action:'createWorkspace',name:'Second'})]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(sqlite.prepare('select count(*) as n from workspaces').get().n,1);
  assert.equal(sqlite.prepare('select count(*) as n from members').get().n,1);
  sqlite.close();
});

test('outreach rechecks assignment and preserves concurrent lead edits',async()=>{
  const sqlite=await setup(), admin=user('race-admin'), teammate=user('race-member');
  let state=await mutate(admin,{action:'createWorkspace',name:'Concurrent outreach'});
  const adminId=state.currentMember.id;
  await mutate(admin,{action:'inviteMember',name:'Member',email:teammate.email,role:'member'});
  const memberId=(await service.snapshot(teammate)).currentMember.id;
  state=await mutate(admin,{action:'addLead',lead:{name:'Lead',company:'Company',ownerId:memberId}});
  const lead=state.leads[0];
  beforeBatch=()=>sqlite.prepare("update leads set owner_id=?, data=json_set(data,'$.ownerId',?,'$.notes','Concurrent note') where id=?").run(adminId,adminId,lead.id);
  await assert.rejects(mutate(teammate,{action:'saveMessage',leadId:lead.id,platform:'Instagram',body:'Must not save',direction:'inbound'}),{status:409});
  state=await service.snapshot(admin);
  assert.equal(state.messages.length,0);
  assert.equal(state.notifications.length,0);
  assert.equal(state.leads[0].ownerId,adminId);
  assert.equal(state.leads[0].notes,'Concurrent note');
  beforeBatch=()=>sqlite.prepare("update leads set data=json_set(data,'$.notes','Newest note') where id=?").run(lead.id);
  state=await mutate(admin,{action:'saveMessage',leadId:lead.id,platform:'Instagram',body:'Authorized outreach',status:'logged'});
  assert.equal(state.leads[0].notes,'Newest note');
  assert.equal(state.leads[0].status,'Contacted');
  assert.equal(state.leads[0].ownerId,adminId);
  await service.mergeDiscoveredLinks(await service.requireWorkspace(admin),lead.id,{Instagram:'https://instagram.com/existing'});
  await service.mergeDiscoveredLinks(await service.requireWorkspace(admin),lead.id,{Instagram:'https://instagram.com/replacement',Facebook:'https://facebook.com/company'});
  const updated=(await service.snapshot(admin)).leads[0];
  assert.equal(updated.socialLinks.Instagram,'https://instagram.com/existing');
  assert.equal(updated.socialLinks.Facebook,'https://facebook.com/company');
  assert.equal(updated.notes,'Newest note');
  sqlite.close();
});

test('only admins manage members; removal blocks existing identities and preserves history',async()=>{
 const sqlite=await setup(),admin=user('access-admin'),teammate=user('access-member'),outsider=user('access-outsider');
 let state=await mutate(admin,{action:'createWorkspace',name:'Access controls'});const ownerId=state.currentMember.id;
 await mutate(outsider,{action:'createWorkspace',name:'Other'});
 state=await mutate(admin,{action:'inviteMember',name:'Member',email:teammate.email,role:'member'});
 const memberId=state.members.find(m=>m.email===teammate.email).id;
 await service.snapshot(teammate);
 state=await mutate(admin,{action:'addLead',lead:{name:'Lead',company:'History',ownerId:memberId,notes:'Preserve me'}});const leadId=state.leads[0].id;
 await mutate(teammate,{action:'saveMessage',leadId,platform:'Instagram',body:'Historic outreach',status:'logged'});
 await assert.rejects(mutate(teammate,{action:'setMemberStatus',id:ownerId,status:'removed'}),{status:403});
 await assert.rejects(mutate(outsider,{action:'setMemberStatus',id:memberId,status:'removed'}),{status:404});
 await assert.rejects(mutate(admin,{action:'setMemberStatus',id:ownerId,status:'removed'}),{status:400});
 await mutate(admin,{action:'setMemberStatus',id:memberId,status:'suspended'});
 await assert.rejects(service.snapshot(teammate),{status:403});
 await assert.rejects(mutate(teammate,{action:'saveMessage',leadId,platform:'Instagram',body:'Blocked'}),{status:403});
 await assert.rejects(mutate(teammate,{action:'createWorkspace',name:'Bypass'}),{status:403});
 state=await mutate(admin,{action:'setMemberStatus',id:memberId,status:'active'});
 assert.equal((await service.snapshot(teammate)).leads.length,1,'suspension keeps assignments');
 state=await mutate(admin,{action:'setMemberStatus',id:memberId,status:'removed'});
 assert.equal(state.leads[0].ownerId,ownerId);assert.equal(state.leads[0].notes,'Preserve me');
 assert.equal(state.messages[0].memberId,memberId,'historical authorship is preserved');
 await assert.rejects(service.snapshot(teammate),{status:403});
 await mutate(admin,{action:'setMemberStatus',id:memberId,status:'active'});
 assert.equal((await service.snapshot(teammate)).leads.length,0,'restore does not steal reassigned leads');
 sqlite.close();
});

test('restricted members cannot use protected features or restore their own permissions',async()=>{
 const sqlite=await setup(),admin=user('permissions-admin'),teammate=user('permissions-member');
 let state=await mutate(admin,{action:'createWorkspace',name:'Permission checks'});
 state=await mutate(admin,{action:'inviteMember',name:'Member',email:teammate.email,role:'member'});
 const memberId=state.members.find(m=>m.email===teammate.email).id;
 await service.snapshot(teammate);
 state=await mutate(admin,{action:'addLead',lead:{name:'Lead',company:'Assigned',ownerId:memberId}});const leadId=state.leads[0].id;
 await mutate(teammate,{action:'saveMessage',leadId,platform:'Instagram',body:'Before restriction'});
 const permissions=Object.fromEntries(['leadFinder','createLeads','editLeads','outreach','audits','reports','exports','socialAccounts'].map(key=>[key,false]));
 await assert.rejects(mutate(teammate,{action:'setMemberPermissions',id:memberId,permissions}),{status:403});
 await mutate(admin,{action:'setMemberPermissions',id:memberId,permissions});
 const restricted=await service.snapshot(teammate);
 assert.equal(restricted.leads.length,1);assert.equal(restricted.messages.length,0);assert.equal(restricted.audits.length,0);assert.equal(restricted.accounts.length,0);
 assert.deepEqual(restricted.currentMember.permissions,permissions);
 for(const action of [
  {action:'addLead',lead:{name:'No',company:'No'}},
  {action:'updateLead',id:leadId,changes:{status:'Won'}},
  {action:'saveMessage',leadId,platform:'Instagram',body:'No'},
  {action:'saveAccount',platform:'Instagram',handle:'no',profileUrl:'https://instagram.com/no'},
 ])await assert.rejects(mutate(teammate,action),{status:403});
 await assert.rejects(service.storeAudit(await service.requireWorkspace(teammate),{leadId,type:'SEO',status:'complete',score:80,summary:'No',checks:[]}),{status:403});
 const exportModule=await loadModule(resolve(root,'lib/data-export'));await exportModule.evaluate();
 await assert.rejects(exportModule.namespace.authorizedExport(teammate,'leads','week'),{status:403});
 await assert.rejects(exportModule.namespace.authorizedReport(teammate,'week'),{status:403});
 await mutate(admin,{action:'setMemberPermissions',id:memberId,permissions:{...permissions,outreach:true,exports:true,reports:true}});
 assert.equal((await service.snapshot(teammate)).messages.length,1);
 assert.match(await exportModule.namespace.authorizedExport(teammate,'leads','week'),/Assigned/);
 assert.equal((await exportModule.namespace.authorizedReport(teammate,'week')).members.length,1);
 sqlite.close();
});

test('removing an unclaimed invitation blocks sign-in until an admin restores it',async()=>{
 const sqlite=await setup(),admin=user('invite-admin'),pending=user('invite-pending');
 await mutate(admin,{action:'createWorkspace',name:'Invitation controls'});
 let state=await mutate(admin,{action:'inviteMember',name:'Pending',email:pending.email,role:'member'});
 const id=state.members.find(m=>m.email===pending.email).id;
 await mutate(admin,{action:'setMemberStatus',id,status:'removed'});
 await assert.rejects(service.snapshot(pending),{status:403});
 await assert.rejects(mutate(pending,{action:'createWorkspace',name:'Bypass'}),{status:403});
 state=await mutate(admin,{action:'setMemberStatus',id,status:'active'});
 assert.equal(state.members.find(m=>m.id===id).status,'invited');
 assert.equal((await service.snapshot(pending)).currentMember.status,'active');
 sqlite.close();
});

test('email/password activation, recovery, sessions, revocation, and owner bootstrap',async()=>{
 const sqlite=await setup(),owner=user('password-owner'),teammate=user('password-member'),other=user('password-outsider');
 const configModule=await loadModule(resolve(root,'lib/auth-config'));await configModule.evaluate();
 const accountModule=await loadModule(resolve(root,'lib/account-service'));await accountModule.evaluate();
 const accounts=accountModule.namespace;
 const origin='http://localhost:5173';
 const auth=configModule.namespace.createPasswordAuth(db,'test-only-secret-with-more-than-thirty-two-characters',origin);
 const firstPassword='Test-only initial password 173!';
 await assert.rejects(accounts.setupOwnerPassword(other,firstPassword,owner.email,auth),{status:403});
 await accounts.setupOwnerPassword(owner,firstPassword,owner.email,auth);
 let state=await service.snapshot(owner);assert.equal(state.currentMember.accountReady,true);
 await assert.rejects(accounts.setupOwnerPassword(owner,firstPassword,owner.email,auth),{status:409});
 const stored=sqlite.prepare("select password from auth_account where provider_id='credential'").get();assert.notEqual(stored.password,firstPassword);assert.ok(stored.password.length>40);
 state=await mutate(owner,{action:'inviteMember',name:'Invited member',email:teammate.email,role:'member'});
 const member=state.members.find(m=>m.email===teammate.email);
 const link=await accounts.createAccountLink(owner,member.id,'activate',origin);
 const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get('token');
 assert.notEqual(sqlite.prepare('select token_hash from account_links').get().token_hash,token);
 await assert.rejects(accounts.redeemAccountLink('0'.repeat(64),firstPassword,auth),{status:400});
 await accounts.redeemAccountLink(token,firstPassword,auth);
 await assert.rejects(accounts.redeemAccountLink(token,firstPassword,auth),{status:400});
 const bound=sqlite.prepare('select * from members where id=?').get(member.id);assert.ok(bound.auth_user_id);assert.equal(bound.status,'active');
 const memberUser={...teammate,userId:bound.user_id};
 async function signIn(email,password){return auth.handler(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'cf-connecting-ip':'198.51.100.27'},body:JSON.stringify({email,password})}))}
 assert.equal((await signIn(teammate.email,'wrong-password')).status,401);
 const login=await signIn(teammate.email,firstPassword);assert.equal(login.status,200);
 const cookies=login.headers.getSetCookie();assert.ok(cookies.some(c=>/HttpOnly/i.test(c)));assert.ok(cookies.some(c=>/SameSite=Lax/i.test(c)));
 const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 assert.ok(await auth.api.getSession({headers:new Headers({cookie})}));
 await assert.rejects(accounts.createAccountLink(memberUser,member.id,'reset',origin),{status:403});
 const reset=await accounts.createAccountLink(owner,member.id,'reset',origin);
 const resetToken=new URLSearchParams(new URL(reset.url).hash.slice(1)).get('token');
 await accounts.redeemAccountLink(resetToken,'Test-only replacement password 174!',auth);
 assert.equal(await auth.api.getSession({headers:new Headers({cookie})}),null,'reset invalidates existing sessions');
 assert.equal((await signIn(teammate.email,firstPassword)).status,401);
 assert.equal((await signIn(teammate.email,'Test-only replacement password 174!')).status,200);
 assert.ok(sqlite.prepare('select count(*) as n from auth_session where user_id=?').get(bound.auth_user_id).n>0);
 await mutate(owner,{action:'setMemberStatus',id:member.id,status:'suspended'});
 assert.equal(sqlite.prepare('select count(*) as n from auth_session where user_id=?').get(bound.auth_user_id).n,0);
 assert.equal((await signIn(teammate.email,'Test-only replacement password 174!')).status,403);
 await mutate(owner,{action:'setMemberStatus',id:member.id,status:'active'});
 const expires=await accounts.createAccountLink(owner,member.id,'reset',origin);
 sqlite.prepare("update account_links set expires_at='2000-01-01T00:00:00.000Z' where used_at is null").run();
 await assert.rejects(accounts.redeemAccountLink(new URLSearchParams(new URL(expires.url).hash.slice(1)).get('token'),firstPassword,auth),{status:400});
 const policy=await loadModule(resolve(root,'lib/auth-http-policy'));await policy.evaluate();
 assert.equal(policy.namespace.isAllowedAuthRequest('POST','/api/auth/sign-up/email'),false);
 assert.equal(policy.namespace.isAllowedAuthRequest('POST','/api/auth/sign-in/email'),true);
 assert.equal(policy.namespace.isAllowedAuthRequest('GET','/api/auth/sign-out'),false);
 sqlite.close();
});
