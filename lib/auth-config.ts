import {betterAuth} from 'better-auth';
import {APIError} from 'better-auth/api';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {eq} from 'drizzle-orm';
import type {getDb} from '../db';
import * as tables from '../db/schema';

export function createPasswordAuth(db:ReturnType<typeof getDb>,secret:string,origin:string){
 return betterAuth({
  appName:'Highlevel Leads',baseURL:origin,basePath:'/api/auth',secret,trustedOrigins:[origin],
  database:drizzleAdapter(db,{provider:'sqlite',transaction:false,schema:{user:tables.authUser,session:tables.authSession,account:tables.authAccount,verification:tables.authVerification,rateLimit:tables.authRateLimit}}),
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false},
  session:{expiresIn:60*60*24*7,updateAge:60*60,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:10}}},
  advanced:{cookiePrefix:'highlevel',useSecureCookies:origin.startsWith('https:'),ipAddress:{ipAddressHeaders:process.env.VERCEL?['x-vercel-forwarded-for']:[]},defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:')}},
  databaseHooks:{session:{create:{before:async session=>{
   const membership=await db.select().from(tables.members).where(eq(tables.members.authUserId,session.userId)).get();
   if(!membership||membership.status!=='active')throw new APIError('FORBIDDEN',{message:'Workspace access is not active. Contact your admin.'});
   return {data:session};
  }}}},
 });
}
