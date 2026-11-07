import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {createAccountLink} from '../../../../lib/account-service';
import {requireWorkspace} from '../../../../lib/server-workspace';
import {assertSameOrigin,WorkspaceError} from '../../../../lib/workspace-policy';
import {accountFailure} from '../../../../lib/account-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await getChatGPTUser();
 if(!user||!env.BOOTSTRAP_OWNER_EMAIL||user.email.toLowerCase()!==env.BOOTSTRAP_OWNER_EMAIL.toLowerCase())throw new WorkspaceError('Owner recovery requires the configured owner identity.',403);
 const ctx=await requireWorkspace(user);if(ctx.workspace.ownerUserId!==user.userId)throw new WorkspaceError('Only the owner can recover this account.',403);
 return Response.json(await createAccountLink(user,ctx.member.id,'reset',env.BETTER_AUTH_URL||new URL(request.url).origin),{headers:{'Cache-Control':'no-store'}});
}catch(e){return accountFailure(e)}}
