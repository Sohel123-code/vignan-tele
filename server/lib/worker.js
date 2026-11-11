import {createHash} from 'node:crypto';
import {query,rpc} from './supabase.js';
import {mapOutperoPayload,sendLeadToOutpero} from './outpero.js';
import {extractAnswers} from './extract.js';
import {readiness} from './config.js';
import {getEmployee,placeCall,findCall} from './outperoApi.js';

function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export function eventKey(payload){const id=payload.event_id??payload.eventId??(payload.object==='event'?payload.id:null);return typeof id==='string'?'event:'+id:'hash:'+createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');}

export async function processEvent(db,event,config,extract=extractAnswers){
  if(event.payload.test===true){await query(db.from('calling_webhook_events').update({status:'ignored',last_error:'Provider test event; no real call modified.'}).eq('id',event.id));return;}
  const mapped=mapOutperoPayload(event.payload);
  if(!mapped.status){await query(db.from('calling_webhook_events').update({status:'ignored',last_error:'Unrecognised or non-terminal event; verify adapter.'}).eq('id',event.id));return;}
  const match=await rpc(db,'calling_match',{p_provider_id:mapped.outperoCallId,p_phone:mapped.phone,p_contact_id:mapped.contactId});
  if(!match){await query(db.from('calling_webhook_events').update({attempts:event.attempts+1,status:event.attempts>=11?'unmatched':'pending',last_error:'No unambiguous call match. Check provider IDs and adapter.'}).eq('id',event.id));return;}
  const questions=await query(db.from('calling_questions').select('*').eq('campaign_id',match.contact.campaign_id).order('position'));
  const extracted=match.attempt.ended_at?{}:await extract(questions,mapped,config);
  await rpc(db,'calling_finish',{p_event:event.id,p_call:match.attempt.id,p_result:{...mapped,...extracted}});
}
export async function syncProviderCalls(db,config,{find=findCall,extract=extractAnswers}={}){
  const attempts=await query(db.from('calling_calls').select('*').is('ended_at',null).order('last_polled_at',{ascending:true,nullsFirst:true}).limit(25));
  for(const attempt of attempts){
    if(attempt.last_polled_at&&Date.now()-Date.parse(attempt.last_polled_at)<config.pollInterval)continue;
    await query(db.from('calling_calls').update({last_polled_at:new Date().toISOString()}).eq('id',attempt.id));
    try{
      const call=await find(config,attempt);
      if(!call){await query(db.from('calling_calls').update({sync_error:'Awaiting confirmation from Outpero; this contact will not be sent again automatically.'}).eq('id',attempt.id));continue;}
      if(call.external_id!==attempt.id||call.metadata?.contact_id!==attempt.contact_id||call.employee_id!==attempt.outpero_employee_id)throw new Error('Provider call reference does not match this attempt.');
      // Bind an interrupted submission by its exact external_id before processing.
      if(!attempt.outpero_call_id)await rpc(db,'calling_delivery',{p_call:attempt.id,p_provider_id:call.id,p_status:'calling',p_error:null});
      await query(db.from('calling_calls').update({provider_status:call.status,provider_detail:call.status_detail||null,sync_error:null}).eq('id',attempt.id).is('ended_at',null));
      const mapped=mapOutperoPayload(call);
      if(!mapped.status)continue;
      const key=eventKey(call);
      const {error}=await db.from('calling_webhook_events').insert({event_id:key,payload:call});if(error&&error.code!=='23505')throw error;
      const event=await query(db.from('calling_webhook_events').select('*').eq('event_id',key).single());
      if(event.status!=='processed')await processEvent(db,event,config,extract);
    }catch(e){await query(db.from('calling_calls').update({sync_error:e.message||'Could not refresh Outpero status.'}).eq('id',attempt.id));}
  }
}
export function createWorker(db,config,{send=sendLeadToOutpero,extract=extractAnswers,log=console.error,place=placeCall,employee=getEmployee,sync=syncProviderCalls}={}){
  let busy=false,stopped=false,timer;
  async function tick(){
    if(busy||stopped)return;busy=true;
    try{
      await rpc(db,'calling_recover',{});
      if(config.mode==='api'&&config.apiKey)await sync(db,config,{extract});
      const events=await query(db.from('calling_webhook_events').select('*').eq('status','pending').order('received_at').limit(10));
      for(const event of events){try{await processEvent(db,event,config,extract);}catch{log('Webhook processing will retry; see calling_webhook_events.');}}
      if(readiness(config).ready){
        const job=await rpc(db,'calling_claim',{p_delay_ms:config.delay});
        if(job){
          // Claims are the dispatch boundary. Pause stops subsequent claims, not an
          // already-claimed request or calls already accepted by Outpero.
          let result,status='calling',error=null;
          if(config.allowedPhones.length&&!config.allowedPhones.includes(job.contact.phone)){status='failed';error='Number is no longer on the demo allowlist.';}
          else try{
            if(config.mode==='api'){
              const agent=await employee(config,job.campaign.outpero_employee_id);
              result=await place(job.contact,config,job.attempt,agent);
            }else result=await send(job.contact,config);
          }catch(e){status=e.uncertain?'needs_review':'failed';error=e.message;}
          await rpc(db,'calling_delivery',{p_call:job.attempt.id,p_provider_id:result?.callId||null,p_status:status,p_error:error});
          if(result?.call)await query(db.from('calling_calls').update({provider_status:result.call.status,provider_detail:result.call.status_detail||null}).eq('id',job.attempt.id).is('ended_at',null));
        }
      }
    }catch{log('Calling worker could not reach its database. Check configuration and migration.');}
    finally{busy=false;}
  }
  return {tick,start(){timer=setInterval(tick,1000);void tick();},async stop(){stopped=true;clearInterval(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,50));}};
}
