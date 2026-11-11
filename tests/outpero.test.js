import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readConfig,readiness} from '../server/lib/config.js';
import {employeeProblem,callPayload,placeCall,findCall,outperoRequest} from '../server/lib/outperoApi.js';
import {callingErrorMessage} from '../src/callingErrors.js';
import {mapOutperoPayload} from '../server/lib/outpero.js';
import {extractAnswers} from '../server/lib/extract.js';
import {verifyOutperoSignature} from '../server/lib/webhookAuth.js';
import {createWorker,syncProviderCalls,eventKey} from '../server/lib/worker.js';
import {createApp} from '../server/app.js';
import {parentFeedbackQuestions} from '../src/parentFeedback.js';

const agent={id:'employee-1',name:'Feedback caller',mode:'instant',status:'working',is_published:true,phone_number_id:'number-1',instant_calling_enabled:true,call_variables:[{key:'parent_name',required:false},{key:'phone',required:true}]};
const contact={id:'contact-1',campaign_id:'campaign-1',phone:'+919876543210',name:'Parent',extra:{}};
const attempt={id:'attempt-1',contact_id:contact.id,outpero_employee_id:agent.id};
const config=readConfig({OUTPERO_API_KEY:'test-key'});
const call={object:'call',id:'call-1',external_id:attempt.id,employee_id:agent.id,customer_number:contact.phone,metadata:{contact_id:contact.id},status:'completed',result:{connected:true,outcome:'interested',summary:'Happy with the college.',sentiment:'positive',duration_seconds:42,transcript:[{speaker:'agent',text:'How was teaching?'},{speaker:'customer',text:'Very good.'}],captured:{overall_satisfaction:4,teaching_quality:5,academic_progress:'Yes'},recording_url:'https://example.test/recording',recording_expires_at:'2026-11-08T20:00:00Z'}};

test('browser preflight supports both local frontend addresses and respects explicit hosted origins',async()=>{
 for(const [env,allowed,denied] of [
  [{},['http://localhost:5173','http://127.0.0.1:5173'],['https://untrusted.example','http://127.0.0.1:9999']],
  [{ALLOWED_ORIGIN:'https://portal.example'},['https://portal.example'],['http://localhost:5173','http://127.0.0.1:5173','https://untrusted.example']]
 ]){
  const server=createApp({db:{},config:readConfig(env)}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
   const url=`http://127.0.0.1:${server.address().port}/api/calling/config`;
   for(const origin of [...allowed,...denied]){
    const response=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
    assert.equal(response.headers.get('access-control-allow-origin'),allowed.includes(origin)?origin:null);
    if(allowed.includes(origin)){
     assert.equal(response.status,204);
     assert.match(response.headers.get('access-control-allow-headers'),/Authorization/i);
     const unauthenticated=await fetch(url,{headers:{Origin:origin}});
     assert.equal(unauthenticated.status,401);
     assert.equal(unauthenticated.headers.get('access-control-allow-origin'),origin);
    }
   }
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});

test('API mode uses existing root aliases and requires no tunnel, webhook or lead secret',()=>{
 const c=readConfig({VITE_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-key',OUTPERO_API_KEY:'provider-key'});
 assert.equal(c.supabaseKey,'server-key');assert.equal(c.supabaseUrl,'https://example.supabase.co');assert.equal(c.mode,'api');assert.equal(readiness(c).ready,true);assert.equal(readiness(c).resultsMode,'polling');
 assert.equal(employeeProblem(agent),null);assert.match(employeeProblem({...agent,mode:'inbound'}),/inbound/);assert.match(employeeProblem({...agent,instant_calling_enabled:false}),/Enable/);
});
test('API submission sends agent variables and a stable attempt idempotency key; old deduplicated calls cannot be attached',async()=>{
 let sent;
 const result=await placeCall(contact,config,attempt,agent,async(url,options)=>{sent={url,options};return new Response(JSON.stringify({...call,status:'queued',result:null}),{status:201});});
 assert.equal(result.callId,'call-1');assert.equal(sent.url,'https://api.outpero.com/v1/calls');assert.equal(sent.options.headers['Idempotency-Key'],attempt.id);
 const body=JSON.parse(sent.options.body);assert.deepEqual(body.variables,{parent_name:'Parent',phone:contact.phone});assert.equal(body.external_id,attempt.id);assert.equal(body.metadata.contact_id,contact.id);assert.equal(body.dry_run,undefined);
 await assert.rejects(placeCall(contact,config,attempt,agent,async()=>new Response(JSON.stringify({...call,external_id:'another-attempt'}))),/earlier call/);
 assert.throws(()=>callPayload(contact,{...agent,call_variables:[{key:'student_id',required:true}]},attempt.id),/student_id/);
});
test('missing outbound number prevents submission and explains provider and historical failures',async()=>{
 let submitted=false;
 await assert.rejects(placeCall(contact,config,attempt,{...agent,phone_number_id:null},async()=>{submitted=true;}),/No outbound phone number/);
 assert.equal(submitted,false);
 await assert.rejects(outperoRequest(config,'/calls',{method:'POST',body:{},fetcher:async()=>new Response(JSON.stringify({error:{code:'no_phone_number'}}),{status:409})}),e=>e.providerStatus===409&&e.uncertain===false&&/assign it to this agent/.test(e.message));
 assert.match(callingErrorMessage('Outpero request failed (409, no_phone_number). Check the agent and account in Outpero.'),/No outbound phone number/);
 assert.equal(callingErrorMessage('Another error'),'Another error');
});
test('public API results map connected status separately from business outcome and preserve structured answers',async()=>{
 const mapped=mapOutperoPayload({object:'event',id:'evt-1',type:'call.completed',data:{call}});
 assert.equal(mapped.status,'completed');assert.equal(mapped.outcome,'interested');assert.equal(mapped.outperoCallId,'call-1');assert.match(mapped.transcript,/Parent: Very good/);
 assert.equal(mapOutperoPayload({...call,status:'not_connected',result:null}).status,'no_answer');
 assert.equal(mapOutperoPayload({...call,status:'blocked',status_detail:'Do-not-call list',result:null}).status,'do_not_call');
 assert.equal(mapOutperoPayload({...call,status:'scheduled',result:null}).status,null);
 assert.equal(mapOutperoPayload({...call,status:'completed',result:null}).status,null,'Wait for the provider result instead of saving an empty completion');
 const questions=parentFeedbackQuestions.map((q,i)=>({...q,id:'q'+i}));
 const answers=await extractAnswers(questions,mapped,{});
 assert.equal(answers.source,'provider');assert.equal(answers.rating,4);assert.equal(answers.sentiment,'positive');assert.equal(answers.items[2].answer,'yes');assert.equal(answers.items[9].answered,false);
 assert.equal(eventKey({object:'event',id:'evt-1',type:'call.completed'}),'event:evt-1');
});
test('HMAC verification rejects tampering, expired timestamps and malformed signatures',()=>{
 const body=Buffer.from('{"event":"test"}'),secret='secret',now=Date.now(),ts=String(Math.floor(now/1000));
 const signature='sha256='+createHmac('sha256',secret).update(ts+'.').update(body).digest('hex');
 assert.equal(verifyOutperoSignature(body,ts,signature,secret,now),true);
 assert.equal(verifyOutperoSignature(Buffer.from('{}'),ts,signature,secret,now),false);
 assert.equal(verifyOutperoSignature(body,ts,signature,secret,now+301000),false);
 assert.equal(verifyOutperoSignature(body,ts,'bad',secret,now),false);
 assert.equal(verifyOutperoSignature(body,'NaN',signature,secret,now),false);
});
test('signed webhook endpoint validates raw JSON bytes before durable storage',async()=>{
 let saved=null;const db={from(){return {insert:async data=>{saved=data;return {error:null};}};}};
 const secret='test-signing-secret',server=createApp({db,config:{...config,signingSecret:secret}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const raw=JSON.stringify({object:'event',id:'evt-1',type:'call.completed',data:{call}},null,2),ts=String(Math.floor(Date.now()/1000));
  const signature='sha256='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex');
  const url=`http://127.0.0.1:${server.address().port}/api/webhook/outpero`;
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Outpero-Timestamp':ts,'X-Outpero-Signature':signature},body:raw})).status,200);
  assert.equal(saved.event_id,'event:evt-1');saved=null;
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Outpero-Timestamp':ts,'X-Outpero-Signature':signature},body:raw+' '})).status,401);assert.equal(saved,null);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

// A small in-memory PostgREST transport exercises polling orchestration; actual
// SQL transactions, RLS and idempotent completion are tested in calling.test.js.
function memoryDatabase(){
 const tables={calling_calls:[{...attempt,ended_at:null}],calling_webhook_events:[],calling_questions:parentFeedbackQuestions.map((q,i)=>({...q,id:'q'+i,campaign_id:contact.campaign_id}))};
 const finished=[];
 return {tables,finished,async rpc(name,args){
  if(name==='calling_delivery'){tables.calling_calls[0].outpero_call_id=args.p_provider_id;return {data:null};}
  if(name==='calling_match')return {data:{attempt:tables.calling_calls[0],contact}};
  if(name==='calling_finish'){finished.push(args);tables.calling_calls[0].ended_at='now';tables.calling_webhook_events[0].status='processed';return {data:null};}
  throw new Error('Unexpected RPC');
 },from(name){let filters=[],action='select',patch,single=false;const builder={select(){return this;},eq(k,v){filters.push(row=>row[k]===v);return this;},is(k,v){filters.push(row=>(row[k]??null)===v);return this;},order(){return this;},limit(){return this;},update(value){action='update';patch=value;return this;},insert(value){action='insert';patch=value;return this;},single(){single=true;return this;},then(resolve,reject){try{let rows=tables[name].filter(row=>filters.every(f=>f(row)));if(action==='update')rows.forEach(row=>Object.assign(row,patch));if(action==='insert'){if(tables[name].some(row=>row.event_id===patch.event_id))return Promise.resolve({error:{code:'23505'}}).then(resolve,reject);tables[name].push({...patch,id:'event-1',attempts:0,status:'pending'});}return Promise.resolve({data:single?rows[0]:rows,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return builder;}};
}
test('polling recovers an interrupted submission and saves actual results without receiving a webhook',async()=>{
 const db=memoryDatabase();let requests=0;
 await syncProviderCalls(db,config,{find:async()=>{requests++;return call;}});
 assert.equal(requests,1);assert.equal(db.tables.calling_calls[0].outpero_call_id,'call-1');assert.equal(db.finished.length,1);assert.equal(db.finished[0].p_result.rating,4);assert.equal(db.finished[0].p_result.status,'completed');
 await syncProviderCalls(db,config,{find:async()=>{requests++;return call;}});assert.equal(requests,1,'Completed attempts stop polling');
 const mismatched=memoryDatabase();await syncProviderCalls(mismatched,config,{find:async()=>({...call,external_id:'another-attempt'})});assert.equal(mismatched.finished.length,0);assert.match(mismatched.tables.calling_calls[0].sync_error,/does not match/);
});
