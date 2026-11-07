import {ZodError} from 'zod';
import {WorkspaceError} from './workspace-policy';
export function accountFailure(error:unknown){
 if(error instanceof WorkspaceError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
 if(error instanceof ZodError)return Response.json({error:error.issues[0]?.message||'Invalid account request.'},{status:400});
 if(error instanceof SyntaxError)return Response.json({error:'Invalid request.'},{status:400});
 return Response.json({error:'Account setup could not be completed. Ask your admin for a new link or check whether your account is already set up.'},{status:400});
}
export async function accountBody(request:Request){const raw=await request.text();if(raw.length>4000)throw new WorkspaceError('Account request is too large.',413);return JSON.parse(raw)}
