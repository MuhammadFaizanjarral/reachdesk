// Input is an exact, non-truncated export, never a model-reconstructed dataset.
import {createClient} from '@libsql/client';
import {readFile} from 'node:fs/promises';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/import-snapshot.mjs /protected/path/snapshot.json');
const order=['workspaces','members','auth_user','auth_account','leads','messages','audits','accounts','notifications'];
const snapshot=JSON.parse(await readFile(file,'utf8'));
if(snapshot.complete!==true||!snapshot.tables)throw new Error('A complete, verified snapshot is required.');
if(!process.env.TURSO_DATABASE_URL)throw new Error('Set target database credentials.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const statements=[];
 for(const table of order){
  const data=snapshot.tables[table];if(!data||!Array.isArray(data.rows))throw new Error(`Missing ${table}`);
  const projection=data.model_projection;
  if(projection&&(projection.truncated||projection.truncated_values||projection.omitted_columns||projection.omitted_rows||projection.next_offset!==null))throw new Error(`Incomplete ${table}; do not import partial data.`);
  const count=Number((await client.execute(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
  if(count)throw new Error(`Target ${table} is not empty. No records were overwritten.`);
  const columns=new Set((await client.execute(`PRAGMA table_info("${table}")`)).rows.map(r=>String(r.name)));
  for(const row of data.rows){
   const keys=Object.keys(row);if(keys.some(k=>!columns.has(k)))throw new Error(`Unknown column in ${table}`);
   statements.push({sql:`INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,args:keys.map(k=>row[k]===undefined?null:row[k])});
  }
 }
 if(statements.length)await client.batch(statements,'write');
 for(const table of order){const n=Number((await client.execute(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);if(n!==snapshot.tables[table].rows.length)throw new Error(`Verification failed: ${table}`);console.log(`${table}: ${n} records verified`)}
 console.log('Import verified. Sessions and outstanding account links were deliberately not copied; members sign in again.');
}finally{client.close()}
