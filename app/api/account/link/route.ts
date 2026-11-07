import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getAppUser} from '../../../../lib/auth';
import {createAccountLink} from '../../../../lib/account-service';
import {assertSameOrigin,WorkspaceError} from '../../../../lib/workspace-policy';
import {accountBody,accountFailure} from '../../../../lib/account-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await getAppUser();if(!user)throw new WorkspaceError('Please sign in.',401);
 const body=z.object({memberId:z.string().min(1).max(100),kind:z.enum(['activate','reset'])}).strict().parse(await accountBody(request));
 return Response.json(await createAccountLink(user,body.memberId,body.kind,env.BETTER_AUTH_URL||new URL(request.url).origin),{headers:{'Cache-Control':'no-store'}});
}catch(e){return accountFailure(e)}}
