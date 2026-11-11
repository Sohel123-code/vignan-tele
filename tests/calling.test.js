import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
import {PGlite} from '@electric-sql/pglite';
import {normalizePhone} from '../server/lib/phone.js';
import {parseContacts} from '../server/lib/upload.js';
import {mapOutperoPayload,sendLeadToOutpero} from '../server/lib/outpero.js';
import {extractAnswers,validateAnswers} from '../server/lib/extract.js';
import {eventKey,createWorker} from '../server/lib/worker.js';
import {createApp} from '../server/app.js';
import {readConfig,readiness} from '../server/lib/config.js';
import {generateScript} from '../server/lib/script.js';

function workbook(rows,type='xlsx'){const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(rows),'Contacts');return XLSX.write(b,{type:'buffer',bookType:type});}
test('contact normalization and XLS/XLSX validation preserve rows and reject malformed numbers',()=>{
 for(const phone of ['9876543210','919876543210','09876543210','+91 98765-43210'])assert.equal(normalizePhone(phone),'+919876543210');
 for(const phone of ['abc9876543210','++919876543210','123',null,''])assert.equal(normalizePhone(phone),null);
 for(const type of ['xlsx','xls']){
  const result=parseContacts(workbook([['Name','Mobile','Branch'],['Parent',9876543210,'CSE'],['Other','+919876543211','ECE'],['Invalid','bad',''],['Duplicate','919876543210','']],type));
  assert.equal(result.good.length,2);assert.equal(result.duplicates,1);assert.deepEqual(result.rejected,[{row:4,reason:'Invalid phone number'}]);assert.equal(result.good[0].extra.branch,'CSE');
 }
 assert.throws(()=>parseContacts(workbook([['email'],['a@b.c']])),/phone/);
 assert.throws(()=>parseContacts(workbook([['phone'],...Array.from({length:201},()=>['9876543210'])])),/200 rows/);
});
test('provider adapter sends only documented fields and marks transport uncertainty',async()=>{
 const config={outperoBaseUrl:'https://example.test/api',slug:'demo',leadSecret:'test'};
 let request;
 const result=await sendLeadToOutpero({phone:'+919876543210',name:'Test',id:'internal'},config,async(url,init)=>{request={url,init};return new Response(JSON.stringify({call_id:'provider-1'}),{status:202});});
 assert.equal(request.url,'https://example.test/api/lead-intake/demo');assert.deepEqual(JSON.parse(request.init.body),{phone:'+919876543210',name:'Test'});assert.equal(result.callId,'provider-1');
 await assert.rejects(sendLeadToOutpero({},config,async()=>{throw new Error('timeout');}),e=>e.uncertain===true);
 await assert.rejects(sendLeadToOutpero({},config,async()=>new Response('',{status:500})),e=>e.uncertain===true);
 await assert.rejects(sendLeadToOutpero({},config,async()=>new Response('',{status:401})),e=>e.uncertain===false);
 assert.equal(mapOutperoPayload({status:'no_answer',summary:'Nobody picked up'}).status,'no_answer');
 assert.equal(mapOutperoPayload({status:'ringing'}).status,null);
 assert.equal(mapOutperoPayload({status:'opt_out'}).status,'do_not_call');
 assert.equal(mapOutperoPayload({recording_url:'javascript:alert(1)'}).recordingUrl,null);
 assert.equal(eventKey({call_id:'1',status:'ringing'}),eventKey({status:'ringing',call_id:'1'}));
 assert.notEqual(eventKey({call_id:'1',status:'ringing'}),eventKey({call_id:'1',status:'completed'}));
});
test('answer extraction validates questions and preserves transcript when optional extraction fails',async()=>{
 const qs=[{id:'q1',question_text:'Rate it',answer_type:'rating'},{id:'q2',question_text:'Satisfied?',answer_type:'yes_no'}];
 const result=validateAnswers({items:[{question_id:'q1',answer:12},{question_id:'q2',answer:'YES'}],rating:7,sentiment:'invented'},qs);
 assert.equal(result.items[0].answered,false);assert.equal(result.items[1].answer,'yes');assert.equal(result.rating,null);assert.equal(result.sentiment,null);
 assert.equal((await extractAnswers(qs,{transcript:'Hello'},{})).source,'not_requested');
 const failed=await extractAnswers(qs,{transcript:'Hello'},{anthropicKey:'test',anthropicModel:'test'},async()=>new Response('bad',{status:500}));
 assert.equal(failed.source,'failed');assert.deepEqual(failed.items,[]);
 assert.match(generateScript({language:'te'},qs),/Telugu/);
 assert.equal(readiness(readConfig({})).ready,false);
});
test('persistent worker claims once, sends sequentially, and quarantines uncertain requests',async()=>{
 const writes=[];let claimed=false,sends=0;
 const db={async rpc(name,args){writes.push([name,args]);if(name==='calling_claim'){if(claimed)return {data:null};claimed=true;return {data:{contact:{id:'c',phone:'+919876543210'},attempt:{id:'a'}}};}return {data:null};},from(){return {select(){return this;},eq(){return this;},order(){return this;},async limit(){return {data:[]};}};}};
 const config={...readConfig({}),mode:'lead',outperoBaseUrl:'https://example.test',slug:'demo',leadSecret:'test',verified:true,webhookSecret:'a'.repeat(32),allowedPhones:['+919876543210']};
 const worker=createWorker(db,config,{send:async()=>{sends++;throw Object.assign(new Error('Delivery uncertain'),{uncertain:true});},log:()=>{}});
 await Promise.all([worker.tick(),worker.tick()]);await worker.tick();
 assert.equal(sends,1);const delivery=writes.find(([name])=>name==='calling_delivery')[1];assert.equal(delivery.p_status,'needs_review');assert.equal(delivery.p_call,'a');await worker.stop();
});
test('API validates trusted admin role and webhook secret, stores before acknowledging, deduplicates',async()=>{
 const stored=new Set();let writes=0,shouldFail=false;
 const db={auth:{getUser:async token=>({data:{user:{id:'11111111-1111-4111-8111-111111111111',app_metadata:{role:token==='admin'?'admin':'student'},user_metadata:{role:'admin'}}}})},from(table){assert.equal(table,'calling_webhook_events');return {insert:async row=>{writes++;if(shouldFail)return {error:{code:'DATABASE_UNAVAILABLE'}};if(stored.has(row.event_id))return {error:{code:'23505'}};stored.add(row.event_id);return {error:null};}};}};
 const config={...readConfig({}),mode:'lead',webhookSecret:'a'.repeat(32)};
 const server=createApp({db,config}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/calling/config')).status,401);
  assert.equal((await fetch(base+'/api/calling/config',{headers:{Authorization:'Bearer student'}})).status,403);
  assert.equal((await fetch(base+'/api/calling/config',{headers:{Authorization:'Bearer admin'}})).status,200);
  const request={method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':'wrong'},body:JSON.stringify({eventId:'test',status:'completed'})};
  assert.equal((await fetch(base+'/api/webhook/outpero',request)).status,401);assert.equal(writes,0);
  request.headers['x-webhook-secret']=config.webhookSecret;
  assert.equal((await fetch(base+'/api/webhook/outpero',request)).status,200);
  assert.deepEqual(await (await fetch(base+'/api/webhook/outpero',request)).json(),{duplicate:true});
  shouldFail=true;request.body=JSON.stringify({eventId:'next'});assert.equal((await fetch(base+'/api/webhook/outpero',request)).status,500);
  assert.equal((await fetch(base+'/api/campaigns/not-a-uuid',{headers:{Authorization:'Bearer admin'}})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('calling SQL is rerunnable: atomic uploads, queue, pause, webhook idempotency, retries, opt-outs and RLS',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema public,auth to authenticated,anon,service_role;`);
  await db.exec(readFileSync('supabase/schema.sql','utf8'));
  const migration=readFileSync('supabase/calling.sql','utf8');await db.exec(migration);await db.exec(migration);
  const actor='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[actor]);
  const branch=(await db.query("insert into branches(name,code) values('Computer Science','CSE') returning id")).rows[0].id;
  const section=(await db.query("insert into sections(branch_id,year,name) values($1,'1st Year','A') returning id",[branch])).rows[0].id;
  await db.exec('set role service_role');
  const mutate=async(action,id,data={})=>(await db.query('select calling_mutate($1,$2,$3::jsonb) result',[action,id,JSON.stringify(data)])).rows[0].result;
  const claim=async()=>(await db.query('select calling_claim(1000) result')).rows[0].result;
  const phone='+919876543210';const phone2='+919876543211';
  const c=await mutate('create',null,{section_id:section,name:'Feedback demo',language:'te',actor});
  await mutate('questions',c.id,{questions:[{question_text:'How was college?',answer_type:'text'}]});
  const contacts=[{name:'One',phone,extra:{}},{name:'Two',phone:phone2,extra:{}}];
  assert.deepEqual(await mutate('upload',c.id,{contacts,max_contacts:5}),{inserted:2,duplicates:0});
  assert.deepEqual(await mutate('upload',c.id,{contacts,max_contacts:5}),{inserted:0,duplicates:2});
  await assert.rejects(mutate('upload',c.id,{contacts:[{phone:'+919876543212'},{phone:'+919876543213'},{phone:'+919876543214'},{phone:'+919876543215'}],max_contacts:5}),/limit/);
  await assert.rejects(mutate('start',c.id,{revision:1,actor,allowed_phones:[phone,phone2]}),/Script changed/);
  await assert.rejects(mutate('start',c.id,{revision:2,actor,allowed_phones:[phone]}),/DEMO_ALLOWED/);
  await mutate('start',c.id,{revision:2,actor,allowed_phones:[phone,phone2]});
  const job=await claim();assert.ok(job.attempt.id);assert.equal(await claim(),null,'Pacing is persistent');
  await mutate('pause',c.id);await db.query("update calling_campaigns set next_dispatch_at=now()-interval '1 minute' where id=$1",[c.id]);assert.equal(await claim(),null,'Pause prevents new claims');
  await assert.rejects(mutate('questions',c.id,{questions:[{question_text:'changed',answer_type:'text'}]}),/new campaign/);
  const provider='provider-1';await db.query("select calling_delivery($1,$2,'calling',null)",[job.attempt.id,provider]);
  const match=(await db.query('select calling_match($1,$2,null) result',[provider,job.contact.phone])).rows[0].result;assert.equal(match.attempt.id,job.attempt.id);
  const finish=async(eventId,status)=>{
   const event=(await db.query("insert into calling_webhook_events(event_id,payload) values($1,'{}') returning id",[eventId])).rows[0].id;
   await db.query('select calling_finish($1,$2,$3::jsonb)',[event,job.attempt.id,JSON.stringify({status,outcome:status,outperoCallId:provider,summary:'Feedback received',durationSeconds:45,items:[],source:'not_requested'})]);return event;
  };
  const event=await finish('event-1','no_answer');await db.query('select calling_finish($1,$2,$3::jsonb)',[event,job.attempt.id,JSON.stringify({status:'completed'})]);await finish('event-2','completed');
  assert.equal((await db.query('select * from calling_feedback')).rows.length,1);
  assert.equal((await db.query('select call_status from calling_contacts where id=$1',[job.contact.id])).rows[0].call_status,'no_answer');
  assert.equal((await mutate('retry',c.id)).requeued,1);
  await mutate('start',c.id,{revision:2,actor,allowed_phones:[phone,phone2]});
  await db.query("update calling_contacts set created_at=now()-interval '1 hour' where id=$1",[job.contact.id]);
  const retry=await claim();assert.equal(retry.contact.id,job.contact.id);
  assert.equal((await db.query('select calling_match(null,$1,null) result',[job.contact.phone])).rows[0].result,null,'Phone alone cannot match a retried attempt');
  await db.query("select calling_delivery($1,'provider-2','calling',null)",[retry.attempt.id]);
  const optout=(await db.query("insert into calling_webhook_events(event_id,payload) values('optout','{}') returning id")).rows[0].id;
  await db.query('select calling_finish($1,$2,$3::jsonb)',[optout,retry.attempt.id,JSON.stringify({status:'do_not_call',outcome:'do_not_call',outperoCallId:'provider-2',items:[]})]);
  assert.equal((await db.query('select phone from calling_suppressions')).rows[0].phone,job.contact.phone);
  await db.query("select calling_delivery($1,'provider-2','calling',null)",[retry.attempt.id]);
  assert.equal((await db.query('select call_status from calling_contacts where id=$1',[job.contact.id])).rows[0].call_status,'do_not_call','Late intake acknowledgement cannot regress terminal result');
  await db.exec(`reset role;set role authenticated;set request.jwt.claims='{"app_metadata":{"role":"student"},"user_metadata":{"role":"admin"}}';`);
  assert.equal((await db.query('select * from calling_contacts')).rows.length,0);
  await assert.rejects(db.query("select calling_mutate('pause',$1,'{}')",[c.id]),e=>e.code==='42501');
  await db.exec(`set request.jwt.claims='{"app_metadata":{"role":"admin"}}';`);
  assert.equal((await db.query('select * from calling_contacts')).rows.length,2);
  await assert.rejects(db.query("update calling_contacts set call_status='pending'"),e=>e.code==='42501');
  await assert.rejects(db.query('select * from calling_webhook_events'),e=>e.code==='42501');
  await db.exec('reset role');
  const seed=readFileSync('supabase/seed-parent-feedback.sql','utf8').replace("section_text text := '<SECTION_ID>'",`section_text text := '${section}'`);
  await db.exec(seed);
  await db.query("update calling_questions set question_text='Admin edited this question' where campaign_id in(select id from calling_campaigns where name='Parent Feedback') and position=1");
  await db.exec(seed);
  const seeded=(await db.query("select id,language from calling_campaigns where name='Parent Feedback'")).rows;
  assert.equal(seeded.length,1);assert.equal(seeded[0].language,'te');
  const seededQuestions=(await db.query('select * from calling_questions where campaign_id=$1 order by position',[seeded[0].id])).rows;
  assert.equal(seededQuestions.length,10);assert.equal(seededQuestions[0].question_text,'Admin edited this question','Rerunning the seed preserves admin edits');
 }finally{await db.close();}
});
