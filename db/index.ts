import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import * as schema from './schema';

function connect(){
 const url=process.env.TURSO_DATABASE_URL;
 if(!url)throw new Error('TURSO_DATABASE_URL is not configured.');
 if(process.env.VERCEL && !/^(libsql|https):\/\//.test(url))throw new Error('Vercel requires a remote database; local files are not durable.');
 const client=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
 return drizzle(client,{schema});
}
let database:ReturnType<typeof connect>|undefined;
export function getDb(){return database??=connect()}
