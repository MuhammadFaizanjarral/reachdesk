import {z} from 'zod';
import {getPasswordAuth} from '../../../../lib/auth';
import {redeemAccountLink} from '../../../../lib/account-service';
import {assertSameOrigin} from '../../../../lib/workspace-policy';
import {accountBody,accountFailure} from '../../../../lib/account-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 assertSameOrigin(request);const body=z.object({token:z.string().length(64),password:z.string().min(12).max(128)}).strict().parse(await accountBody(request));
 return Response.json(await redeemAccountLink(body.token,body.password,getPasswordAuth()),{headers:{'Cache-Control':'no-store'}});
}catch(e){return accountFailure(e)}}
