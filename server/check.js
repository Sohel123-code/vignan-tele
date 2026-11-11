import {readConfig,readiness} from './lib/config.js';
import {createDatabase,query} from './lib/supabase.js';
import {getEmployees,outperoRequest} from './lib/outperoApi.js';
const config=readConfig();
const state=readiness(config);
if(!state.ready)process.exitCode=1;
console.log('Outpero setup:',state.ready?'configured':'incomplete');
for(const missing of state.missing)console.log('- '+missing);
if(!config.supabaseUrl||!config.supabaseKey){console.log('Missing Supabase URL or server key in .env or server/.env.');process.exitCode=1;}
else{
 const db=createDatabase(config);
 for(const table of ['calling_campaigns','calling_questions','calling_contacts','calling_calls','calling_feedback','calling_webhook_events','calling_suppressions']){
  try{await query(db.from(table).select('*',{head:true,count:'exact'}).limit(0));console.log(table+': accessible');}
  catch{console.log(table+': unavailable — check credentials and run supabase/calling.sql');process.exitCode=1;}
 }
 try{await query(db.from('calling_campaigns').select('outpero_employee_id',{head:true}).limit(0));await query(db.from('calling_questions').select('capture_key',{head:true}).limit(0));console.log('Direct API migration: accessible');}catch{console.log('Direct API migration: run the updated supabase/calling.sql');process.exitCode=1;}
}
if(config.mode==='api'&&config.apiKey){
 try{await outperoRequest(config,'/me');console.log('Outpero API key: accepted');const agents=await getEmployees(config);for(const a of agents)console.log(`${a.name}: ${a.unavailable_reason||'ready for outbound calls'}`);if(!agents.some(a=>!a.unavailable_reason))process.exitCode=1;}
 catch(e){console.log(e.message);process.exitCode=1;}
}
// Read-only: never place calls, print secret values or create database records.
