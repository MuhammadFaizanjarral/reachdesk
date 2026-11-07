import {env} from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {getChatGPTUser} from '../chatgpt-auth';
import {getDb} from '../../db';
import {members} from '../../db/schema';
import AuthScreen from '../auth-screen';
export const dynamic='force-dynamic';
export default async function SetupAccount(){
 const user=await getChatGPTUser();const allowed=!!user&&!!env.BOOTSTRAP_OWNER_EMAIL&&user.email.toLowerCase()===env.BOOTSTRAP_OWNER_EMAIL.toLowerCase();
 const member=allowed?await getDb().select().from(members).where(eq(members.userId,user!.userId)).get():null;
 return <AuthScreen mode="setup" ownerAllowed={allowed} ownerEmail={allowed?user!.email:''} accountReady={!!member?.authUserId}/>;
}
