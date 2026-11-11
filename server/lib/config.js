import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const localEnvironment={};
for(const relative of ['../../.env','../.env']){
  try{for(const [key,value] of Object.entries(dotenv.parse(readFileSync(fileURLToPath(new URL(relative,import.meta.url)))))){if(value.trim())localEnvironment[key]=value;}}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
// Hosting environment wins; nonempty server/.env overrides root .env. Blank
// example entries must not hide the user's already configured root API key.
for(const [key,value] of Object.entries(localEnvironment)){if(process.env[key]===undefined)process.env[key]=value;}

export function readConfig(env=process.env) {
  const integer=(name,fallback,min,max)=>{const n=Number(env[name]||fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid ${name}`);return n;};
  return {
    port:integer('PORT',4000,1,65535), supabaseUrl:(env.SUPABASE_URL||env.VITE_SUPABASE_URL)?.trim(), supabaseKey:(env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY)?.trim(),
    mode:env.OUTPERO_MODE||'api', apiKey:env.OUTPERO_API_KEY?.trim(), apiUrl:(env.OUTPERO_API_URL||'https://api.outpero.com/v1').replace(/\/$/,''),
    defaultEmployeeId:env.OUTPERO_EMPLOYEE_ID?.trim()||'', signingSecret:env.OUTPERO_WEBHOOK_SECRET?.trim(),
    pollInterval:integer('OUTPERO_POLL_INTERVAL_MS',5000,5000,60000), serveFrontend:env.SERVE_FRONTEND==='true',
    outperoBaseUrl:env.OUTPERO_BASE_URL?.trim(), slug:env.OUTPERO_SLUG?.trim(), leadSecret:env.OUTPERO_LEAD_SECRET?.trim(),
    verified:env.OUTPERO_ADAPTER_VERIFIED==='true', webhookSecret:env.WEBHOOK_SHARED_SECRET?.trim(),
    webhookHeader:(env.WEBHOOK_SECRET_HEADER||'x-webhook-secret').toLowerCase(),
    origins:(env.ALLOWED_ORIGIN||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim()).filter(Boolean),
    delay:integer('CALL_DELAY_MS',5000,1000,60000), maxContacts:integer('DEMO_MAX_CONTACTS',5,1,5),
    allowedPhones:(env.DEMO_ALLOWED_PHONES||'').split(',').map(s=>s.trim()).filter(Boolean),
    anthropicKey:env.ANTHROPIC_API_KEY?.trim(), anthropicModel:env.ANTHROPIC_MODEL?.trim()
  };
}
export function readiness(config) {
  const missing=[];
  if(config.mode==='api'){
    if(!config.apiKey)missing.push('OUTPERO_API_KEY in the backend environment');
    if(config.allowedPhones.some(p=>!/^\+[1-9]\d{9,14}$/.test(p)))missing.push('Use international format in DEMO_ALLOWED_PHONES');
    return {ready:missing.length===0,missing,maxContacts:config.maxContacts,mode:'api',resultsMode:'polling',defaultEmployeeId:config.defaultEmployeeId||''};
  }
  if(!config.outperoBaseUrl||!config.slug||!config.leadSecret)missing.push('Outpero lead intake credentials');
  if(!config.webhookSecret||config.webhookSecret.length<32)missing.push('Webhook secret (at least 32 characters)');
  if(!config.verified)missing.push('Verified Outpero API and webhook adapter');
  if(!config.allowedPhones.length)missing.push('Consenting demo numbers in DEMO_ALLOWED_PHONES');
  else if(config.allowedPhones.some(p=>!/^\+[1-9]\d{9,14}$/.test(p)))missing.push('Demo numbers must use international format, such as +91 followed by 10 digits');
  if(config.outperoBaseUrl){try{const url=new URL(config.outperoBaseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error();}catch{missing.push('A valid HTTPS Outpero intake base URL');}}
  return {ready:missing.length===0,missing,maxContacts:config.maxContacts};
}
