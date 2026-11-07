import {getChatGPTUser} from '../../chatgpt-auth';
import {authorizedReport} from '../../../lib/data-export';
import {WorkspaceError} from '../../../lib/workspace-policy';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const user=await getChatGPTUser();if(!user)return Response.json({error:'Please sign in.'},{status:401});
    const period=new URL(request.url).searchParams.get('period')==='month'?'month':'week';
    return Response.json(await authorizedReport(user,period),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(error instanceof WorkspaceError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
    return Response.json({error:'Report could not be generated.'},{status:500});
  }
}
