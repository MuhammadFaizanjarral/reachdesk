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
