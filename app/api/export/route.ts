import {getAppUser} from '../../../lib/auth';
import {authorizedExport} from '../../../lib/data-export';
import {WorkspaceError} from '../../../lib/workspace-policy';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const user=await getAppUser();if(!user)return Response.json({error:'Please sign in.'},{status:401});
    const params=new URL(request.url).searchParams;
    const type=params.get('type')==='report'?'report':'leads';
    const period=params.get('period')==='month'?'month':'week';
    const filters=Object.fromEntries(['q','platform','status','industry','location'].map(key=>[key,(params.get(key)||'').slice(0,200)]));
    const content=await authorizedExport(user,type,period,filters);
    return new Response(content,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="highlevel-${type}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error) {
    if(error instanceof WorkspaceError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
    return Response.json({error:'Export could not be generated.'},{status:500});
  }
}
