// Verified against https://docs.outpero.com/developers/openapi.json (Outpero v1).
import {missingOutperoNumber} from '../../src/callingErrors.js';
export async function outperoRequest(config,path,{method='GET',body,idempotencyKey,fetcher=fetch}={}){
  if(!config.apiKey)throw Object.assign(new Error('Set OUTPERO_API_KEY in the backend environment.'),{status:503});
  const base=new URL(config.apiUrl||'https://api.outpero.com/v1');
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('OUTPERO_API_URL must be an HTTPS API URL.');
  let response;
  try{response=await fetcher(base.href.replace(/\/$/,'')+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${config.apiKey}`,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined});}
  catch{throw Object.assign(new Error('Outpero could not be reached. Status will be checked again before any retry.'),{status:502,uncertain:method!=='GET'});}
  const result=await response.json().catch(()=>null);
  if(!response.ok){const code=result?.error?.code;throw Object.assign(new Error(code==='no_phone_number'?missingOutperoNumber:`Outpero request failed (${response.status}${typeof code==='string'?`, ${code.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}`:''}). Check the agent and account in Outpero.`),{status:502,providerStatus:response.status,uncertain:method!=='GET'&&(response.status>=500||response.status===408)});}
  if(!result)throw Object.assign(new Error('Outpero returned an unreadable response.'),{status:502,uncertain:method!=='GET'});
  return result;
}
export function employeeProblem(employee){
  if(employee.mode!=='instant')return `${employee.name||'This agent'} is an ${employee.mode||'unsupported'} agent. Select an Instant/outbound agent to place calls.`;
  if(!employee.is_published)return 'Publish this agent in Outpero before calling.';
  if(employee.status==='paused')return `${employee.name||'This agent'} is paused. Resume it in Outpero to enable outbound calls.`;
  if(employee.status!=='working'||employee.instant_calling_enabled===false)return 'Enable this agent’s Instant calling in Outpero.';
  if(!employee.phone_number_id)return missingOutperoNumber;
  return null;
}
export async function getEmployees(config){
  const employees=[];let cursor='';
  do{const page=await outperoRequest(config,'/employees?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''));employees.push(...page.data);const next=page.has_more?page.next_starting_after:null;if(page.has_more&&(!next||next===cursor))throw new Error('Outpero employee pagination failed.');cursor=next;}while(cursor);
  return employees.map(e=>({...e,unavailable_reason:employeeProblem(e)}));
}
export const getEmployee=(config,id)=>outperoRequest(config,'/employees/'+encodeURIComponent(id));
export function callPayload(contact,employee,attemptId){
  const variables={};
  for(const field of employee.call_variables||[]){
    let value=contact.extra?.[field.key];
    if(field.role==='phone'||field.key==='phone')value=contact.phone;
    if(field.role==='name'||['name','parent_name','lead_name'].includes(field.key))value=contact.name||'';
    if(field.required&&(value==null||value===''))throw Object.assign(new Error(`Missing ${field.label||field.key}. Add a ${field.key} column to the contact sheet.`),{status:400});
    if(['string','number','boolean'].includes(typeof value))variables[field.key]=value;
  }
  return {employee_id:employee.id,phone:contact.phone,name:contact.name||undefined,variables,external_id:attemptId,metadata:{contact_id:contact.id,campaign_id:contact.campaign_id}};
}
export async function placeCall(contact,config,attempt,employee,fetcher=fetch){
  const problem=employeeProblem(employee);if(problem)throw Object.assign(new Error(problem),{status:400});
  const call=await outperoRequest(config,'/calls',{method:'POST',body:callPayload(contact,employee,attempt.id),idempotencyKey:attempt.id,fetcher});
  if(call.object!=='call'||typeof call.id!=='string')throw Object.assign(new Error('Outpero did not return a call ID. Delivery needs review.'),{uncertain:true});
  // The provider may deduplicate by phone even for a different idempotency key.
  // Never attach the old call to this attempt or credit old feedback to it.
  if(call.external_id!==attempt.id)throw Object.assign(new Error('Outpero returned an earlier call for this number. Wait until its duplicate window ends before retrying.'),{uncertain:false});
  return {callId:call.id,call};
}
export async function findCall(config,attempt){
  if(attempt.outpero_call_id)return outperoRequest(config,'/calls/'+encodeURIComponent(attempt.outpero_call_id));
  const list=await outperoRequest(config,'/calls?external_id='+encodeURIComponent(attempt.id)+'&limit=2');
  if(list.data?.length!==1||list.data[0].external_id!==attempt.id)return null;
  return outperoRequest(config,'/calls/'+encodeURIComponent(list.data[0].id));
}
