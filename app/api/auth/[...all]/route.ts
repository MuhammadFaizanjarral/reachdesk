import {getPasswordAuth} from '../../../../lib/auth';
import {assertSameOrigin,WorkspaceError} from '../../../../lib/workspace-policy';
export const dynamic='force-dynamic';
import {isAllowedAuthRequest} from '../../../../lib/auth-http-policy';
async function handle(request:Request){
 try {
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(!isAllowedAuthRequest(request.method,path))return Response.json({error:'This account action is not available. Ask your admin for an activation or recovery link.'},{status:404});
  if(request.method!=='GET')assertSameOrigin(request);
  const response=await getPasswordAuth().handler(request);
  response.headers.set('Cache-Control','no-store');
  return response;
 }catch(e){
  if(e instanceof WorkspaceError)return Response.json({error:e.message},{status:e.status});
  return Response.json({error:'Sign-in is temporarily unavailable. Please contact your admin.'},{status:503});
 }
}
export const GET=handle;
export const POST=handle;
