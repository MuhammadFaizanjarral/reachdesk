import {getAppUser} from '../lib/auth';
import WorkspaceApp from './workspace-app';
import AuthScreen from './auth-screen';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getAppUser();
 return user?<WorkspaceApp user={{name:user.displayName,email:user.email}}/>:<AuthScreen/>;
}
