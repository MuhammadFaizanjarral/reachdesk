import {createClient} from '@libsql/client';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const email=process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase(),origin=process.env.BETTER_AUTH_URL;
if(!email||!origin||!process.env.TURSO_DATABASE_URL)throw new Error('Set BOOTSTRAP_OWNER_EMAIL, BETTER_AUTH_URL, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.');
if(!/^https?:\/\//.test(origin))throw new Error('BETTER_AUTH_URL must be the exact application origin.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const now=new Date().toISOString();let member=(await client.execute({sql:'SELECT * FROM members WHERE email=?',args:[email]})).rows[0];
 if(!member){
  const workspaceId=randomUUID(),userId=`owner:${randomUUID()}`,memberId=randomUUID();
  await client.batch([
   {sql:'INSERT INTO workspaces(id,name,owner_user_id,created_at) VALUES(?,?,?,?)',args:[workspaceId,'Highlevel Leads',userId,now]},
   {sql:'INSERT INTO members(id,workspace_id,user_id,name,email,role,status,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[memberId,workspaceId,userId,process.env.BOOTSTRAP_OWNER_NAME||'Workspace Owner',email,'admin','active',now]},
  ],'write');
  member=(await client.execute({sql:'SELECT * FROM members WHERE id=?',args:[memberId]})).rows[0];
 }
 const workspace=(await client.execute({sql:'SELECT * FROM workspaces WHERE id=?',args:[member.workspace_id]})).rows[0];
 if(member.role!=='admin'||member.user_id!==workspace?.owner_user_id||member.status!=='active')throw new Error('Configured email is not the active workspace owner. No access was changed.');
 const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
 const kind=member.auth_user_id?'reset':'activate',expiresAt=new Date(Date.now()+60*60*1000).toISOString();
 await client.batch([
  {sql:'UPDATE account_links SET used_at=? WHERE member_id=? AND used_at IS NULL',args:[now,member.id]},
  {sql:'INSERT INTO account_links(id,member_id,token_hash,kind,created_at,expires_at) VALUES(?,?,?,?,?,?)',args:[randomUUID(),member.id,hash,kind,now,expiresAt]},
 ],'write');
 console.log(`Single-use owner ${kind} link (expires in one hour; keep private):`);
 console.log(`${new URL('/activate',origin).href}#token=${token}`);
}finally{client.close()}
