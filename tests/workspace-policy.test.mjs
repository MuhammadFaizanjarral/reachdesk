import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema, assertAdmin, assertLeadOwner, assertSameOrigin, publicUrlSchema } from '../lib/workspace-policy.ts';

test('team members cannot perform admin operations or access another owner',()=>{
  assert.throws(()=>assertAdmin({role:'member'}),{status:403});
  assert.throws(()=>assertLeadOwner({role:'member',id:'member-a'},'member-b'),{status:403});
  assert.doesNotThrow(()=>assertLeadOwner({role:'member',id:'member-a'},'member-a'));
  assert.doesNotThrow(()=>assertLeadOwner({role:'admin',id:'admin'},'member-b'));
});
test('CSRF validation requires exact matching origin',()=>{
  assert.doesNotThrow(()=>assertSameOrigin(new Request('https://leads.example/api/workspace',{headers:{origin:'https://leads.example'}})));
  for(const origin of ['', 'https://evil.example', 'https://leads.example.evil.example','http://leads.example']) {
    assert.throws(()=>assertSameOrigin(new Request('https://leads.example/api/workspace',{headers:origin?{origin}:{}})),{status:403});
  }
});
test('new leads cannot override owner permissions through forged fields',()=>{
  const valid={action:'addLead',lead:{name:'Aisha',company:'North Studio'}};
  assert.equal(actionSchema.parse(valid).lead.platform,'Instagram');
  assert.equal(actionSchema.safeParse({...valid,lead:{...valid.lead,status:'Won'}}).success,false);
  assert.equal(actionSchema.safeParse({...valid,lead:{...valid.lead,workspaceId:'another-workspace'}}).success,false);
});
test('API never accepts claimed provider send status or audit evidence',()=>{
  const valid={action:'saveMessage',leadId:'lead-1',platform:'Instagram',body:'Hello',direction:'outbound'};
  assert.equal(actionSchema.parse(valid).status,'draft');
  for(const status of ['sent','received','delivered']) assert.equal(actionSchema.safeParse({...valid,status}).success,false);
  assert.equal(actionSchema.safeParse({action:'addAudit',audit:{score:100}}).success,false);
});
test('profile URLs reject executable URLs and embedded credentials',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','ftp://example.com','https://user:pass@example.com','not-a-url']) assert.equal(publicUrlSchema.safeParse(url).success,false);
  assert.equal(publicUrlSchema.parse('https://instagram.com/north.studio'),'https://instagram.com/north.studio');
});
test('bounded inputs reject empty messages and excessive records',()=>{
  assert.equal(actionSchema.safeParse({action:'saveMessage',leadId:'x',platform:'Instagram',body:'   '}).success,false);
  assert.equal(actionSchema.safeParse({action:'saveMessage',leadId:'x',platform:'Instagram',body:'a'.repeat(10001)}).success,false);
  assert.equal(actionSchema.safeParse({action:'addLead',lead:{name:'Name',company:'Company',socialLinks:Object.fromEntries(Array.from({length:13},(_,i)=>[String(i),'https://example.com']))}}).success,false);
});
test('invitation email is normalized while roles remain constrained',()=>{
  const invitation={action:'inviteMember',name:'Alex',email:'Alex@Example.com',role:'member'};
  assert.equal(actionSchema.parse(invitation).email,'alex@example.com');
  assert.equal(actionSchema.safeParse({...invitation,role:'owner'}).success,false);
});

test('CSRF validation uses the configured public origin behind a deployment proxy',()=>{
 const previous=process.env.BETTER_AUTH_URL;
 process.env.BETTER_AUTH_URL='https://production.example';
 try{
  assert.doesNotThrow(()=>assertSameOrigin(new Request('http://localhost:3000/api/workspace',{headers:{origin:'https://production.example'}})));
  assert.throws(()=>assertSameOrigin(new Request('http://localhost:3000/api/workspace',{headers:{origin:'http://localhost:3000'}})),{status:403});
 }finally{if(previous===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=previous}
});
