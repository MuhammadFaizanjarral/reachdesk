import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {getPasswordAuth} from '../../../../lib/auth';
import {setupOwnerPassword} from '../../../../lib/account-service';
import {assertSameOrigin,WorkspaceError} from '../../../../lib/workspace-policy';
import {accountBody,accountFailure} from '../../../../lib/account-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await getChatGPTUser();if(!user)throw new WorkspaceError('Open owner setup while signed in to the private preview.',401);
 const body=z.object({password:z.string().min(12).max(128)}).strict().parse(await accountBody(request));
 await setupOwnerPassword(user,body.password,env.BOOTSTRAP_OWNER_EMAIL||'',getPasswordAuth());
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return accountFailure(e)}}
