import {headers} from 'next/headers';
import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {members} from '../db/schema';
import {createPasswordAuth} from './auth-config';
export type AppUser={userId:string;displayName:string;email:string;fullName:string|null};
export function getPasswordAuth(){
 if(!process.env.BETTER_AUTH_SECRET||!process.env.BETTER_AUTH_URL)throw new Error('Email/password authentication is not configured.');
 return createPasswordAuth(getDb(),process.env.BETTER_AUTH_SECRET,process.env.BETTER_AUTH_URL);
}
export async function getAppUser():Promise<AppUser|null>{
 const session=await getPasswordAuth().api.getSession({headers:await headers()});
 if(!session)return null;
 const member=await getDb().select().from(members).where(eq(members.authUserId,session.user.id)).get();
 if(!member||!member.userId)return null;
 return {userId:member.userId,displayName:member.name,email:member.email,fullName:member.name};
}
