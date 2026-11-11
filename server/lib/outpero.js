import {normalizePhone} from './phone.js';

// Provider-specific boundary. Verify these fields against a real Outpero payload.
// Only phone/name are publicly documented for intake: scripts are pasted in Outpero.
export async function sendLeadToOutpero(contact,config,fetcher=fetch){
  const base=new URL(config.outperoBaseUrl);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('Use the HTTPS Outpero intake base URL.');
  const url=base.href.replace(/\/$/,'')+'/lead-intake/'+encodeURIComponent(config.slug);
  let response;
  try{response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Outpero-Lead-Secret':config.leadSecret},body:JSON.stringify({phone:contact.phone,name:contact.name||undefined})});}
  catch{throw Object.assign(new Error('Delivery is uncertain. Check Outpero before retrying.'),{uncertain:true});}
  if(!response.ok)throw Object.assign(new Error(`Outpero returned HTTP ${response.status}.`),{uncertain:response.status>=500||response.status===408});
  const data=await response.json().catch(()=>({}));
  return {callId:typeof(data.call_id??data.callId)==='string'?(data.call_id??data.callId):null};
}
const string=value=>typeof value==='string'?value:null;
export function mapOutperoPayload(p){
  const call=p.object==='call'?p:p.data?.call;
  if(call){
    const result=call.result||{};
    const reason=String(call.status_detail||'');
    const optout=['do_not_call','opt_out'].includes(result.outcome)||/do.not.call|opt.out|\bdnc\b/i.test(reason);
    const status=optout?'do_not_call':({completed:call.result?'completed':null,not_connected:'no_answer',failed:'failed',canceled:'failed',blocked:'failed'})[call.status]||null;
    return {outperoCallId:string(call.id),contactId:string(call.metadata?.contact_id),attemptId:string(call.external_id),phone:normalizePhone(call.customer_number),status,outcome:string(result.outcome)||call.status,
      transcript:Array.isArray(result.transcript)?result.transcript.filter(line=>typeof line.text==='string').map(line=>`${line.speaker==='agent'?'Agent':'Parent'}: ${line.text}`).join('\n'):string(result.transcript),
      summary:string(result.summary),durationSeconds:Number.isInteger(result.duration_seconds)&&result.duration_seconds>=0?result.duration_seconds:null,
      recordingUrl:/^https:\/\//i.test(result.recording_url||'')?result.recording_url:null,
      recordingExpiresAt:result.recording_expires_at||null,captured:result.captured||{},sentiment:result.sentiment||null,structured:null};
  }
  const outcome=string(p.outcome??p.status)?.toLowerCase().replace(/[ -]/g,'_');
  const states={completed:'completed',answered:'completed',success:'completed',failed:'failed',busy:'no_answer',no_answer:'no_answer',unanswered:'no_answer',cancelled:'failed',do_not_call:'do_not_call',opt_out:'do_not_call'};
  const status=states[outcome]||null;
  const duration=Number(p.duration_seconds??p.duration??p.durationSeconds);
  const recording=string(p.recording_url??p.recordingUrl);
  return {
    outperoCallId:string(p.call_id??p.callId),phone:normalizePhone(p.phone??p.to??p.customer?.phone),
    contactId:string(p.external_id??p.metadata?.contactId),status,outcome:outcome||null,
    transcript:string(p.transcript),summary:string(p.summary),
    durationSeconds:Number.isFinite(duration)&&duration>=0?Math.round(duration):null,
    recordingUrl:recording&&/^https:\/\//i.test(recording)?recording:null,
    structured:p.extracted??p.analysis??null
  };
}
