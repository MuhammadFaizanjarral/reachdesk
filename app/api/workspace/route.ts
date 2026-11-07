import { getChatGPTUser } from '../../chatgpt-auth';
import { mutateWorkspace, snapshot } from '../../../lib/server-workspace';
import { actionSchema, assertSameOrigin, WorkspaceError } from '../../../lib/workspace-policy';
import { ZodError } from 'zod';
export const dynamic='force-dynamic';
function json(data:unknown,status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store'}}); }
function failure(error:unknown) {
  if(error instanceof WorkspaceError) return json({error:error.message},error.status);
  if(error instanceof ZodError) return json({error:error.issues[0]?.message||'Invalid request.'},400);
  if(error instanceof SyntaxError) return json({error:'Invalid JSON request.'},400);
  console.error('Workspace operation failed',error instanceof Error?error.name:'Unknown error');
  return json({error:'The workspace could not be updated. Please try again.'},500);
}
export async function GET() {
  try { const user=await getChatGPTUser(); if(!user) return json({error:'Please sign in to use your workspace.'},401); return json(await snapshot(user)); } catch(error) { return failure(error); }
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user=await getChatGPTUser(); if(!user) return json({error:'Please sign in to use your workspace.'},401);
    const body=await request.text(); if(body.length>64000) return json({error:'This request is too large.'},413);
    const action=actionSchema.parse(JSON.parse(body)); return json(await mutateWorkspace(user,action));
  } catch(error) { return failure(error); }
}
