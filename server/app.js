import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {query,rpc} from './lib/supabase.js';
import {readiness} from './lib/config.js';
import {generateScript} from './lib/script.js';
import {parseContacts,sampleWorkbook} from './lib/upload.js';
import {eventKey} from './lib/worker.js';
import {getEmployees,getEmployee,employeeProblem,outperoRequest,callPayload} from './lib/outperoApi.js';
import {verifyOutperoSignature} from './lib/webhookAuth.js';
import {fileURLToPath} from 'node:url';

const uuid=z.string().uuid();
const question=z.object({question_text:z.string().trim().min(1).max(500),answer_type:z.enum(['text','rating','yes_no','choice']),choices:z.array(z.string().trim().min(1).max(150)).max(10).default([]),required:z.boolean().default(true),capture_key:z.string().max(100).regex(/^[a-zA-Z0-9_-]*$/).nullable().optional()}).refine(q=>q.answer_type!=='choice'||q.choices.length>=2,{message:'Choice questions need at least two options.'});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:0}});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const secureEqual=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};

export function createApp({db,config}){
  const app=express();app.disable('x-powered-by');
  app.use(cors({origin(origin,cb){cb(null,!origin||config.origins.includes(origin));},allowedHeaders:['Content-Type','Authorization'],methods:['GET','POST','PUT','OPTIONS']}));
  app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/health',(_req,res)=>res.json({ok:true}));
  app.post('/api/webhook/outpero',express.raw({type:'application/json',limit:'2mb'}),async(req,res)=>{
    const authorized=config.mode==='api'
      ?verifyOutperoSignature(req.body,req.get('X-Outpero-Timestamp'),req.get('X-Outpero-Signature'),config.signingSecret)
      :config.webhookSecret?.length>=32&&secureEqual(req.get(config.webhookHeader),config.webhookSecret);
    if(!authorized)return res.status(401).json({error:'Unauthorized webhook'});
    let payload;try{payload=JSON.parse(req.body.toString('utf8'));}catch{throw fail(400,'Expected valid JSON.');}
    if(!payload||Array.isArray(payload)||typeof payload!=='object')throw fail(400,'Expected a JSON object.');
    const {error}=await db.from('calling_webhook_events').insert({event_id:eventKey(payload),payload});
    if(error?.code==='23505')return res.json({duplicate:true});
    if(error)throw error;
    // Acknowledge only after durable storage; worker survives restarts.
    res.status(200).json({accepted:true});
  });
  app.use('/api',async(req,res,next)=>{
    const token=req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return res.status(401).json({error:'Sign in to continue.'});
    const {data,error}=await db.auth.getUser(token);
    if(error||!data?.user)return res.status(401).json({error:'Session expired. Sign in again.'});
    if(data.user.app_metadata?.role!=='admin')return res.status(403).json({error:'Admin access required.'});
    req.admin=data.user;next();
  });
  app.use('/api',express.json({limit:'128kb'}));
  app.get('/api/calling/config',(_req,res)=>res.json(readiness(config)));
  app.get('/api/calling/agents',async(_req,res)=>res.json(await getEmployees(config)));
  app.get('/api/campaigns',async(req,res)=>{const id=uuid.parse(req.query.section_id);res.json(await query(db.from('calling_campaigns').select('*').eq('section_id',id).order('created_at',{ascending:false}).limit(100)));});
  app.post('/api/campaigns',async(req,res)=>{
    const data=z.object({section_id:uuid,name:z.string().trim().min(1).max(150),intro_message:z.string().trim().max(2000).default(''),language:z.enum(['en','hi','te','ta','kn','ml','mr']).default('en'),outpero_employee_id:z.string().trim().max(100).nullable().optional()}).parse(req.body);
    if(config.mode==='api'&&!data.outpero_employee_id&&config.defaultEmployeeId)data.outpero_employee_id=config.defaultEmployeeId;
    if(config.mode==='api'&&data.outpero_employee_id){const problem=employeeProblem(await getEmployee(config,data.outpero_employee_id));if(problem)throw fail(400,problem);}
    res.status(201).json(await rpc(db,'calling_mutate',{p_action:'create',p_id:null,p_data:{...data,actor:req.admin.id}}));
  });
  app.param('id',(req,_res,next,id)=>{try{uuid.parse(id);next();}catch(e){next(e);}});
  async function campaign(id){const c=await query(db.from('calling_campaigns').select('*').eq('id',id).maybeSingle());if(!c)throw fail(404,'Campaign not found.');return c;}
  async function questions(id){return query(db.from('calling_questions').select('*').eq('campaign_id',id).order('position'));}
  app.put('/api/campaigns/:id/agent',async(req,res)=>{
    const data=z.object({outpero_employee_id:z.string().trim().min(1).max(100)}).parse(req.body);
    const agent=await getEmployee(config,data.outpero_employee_id);const problem=employeeProblem(agent);if(problem)throw fail(400,problem);
    res.json(await rpc(db,'calling_mutate',{p_action:'agent',p_id:req.params.id,p_data:data}));
  });
  async function campaignAgent(id){const c=await campaign(id);if(!c.outpero_employee_id)throw fail(400,'Select and save an Outpero agent first.');const agent=await getEmployee(config,c.outpero_employee_id);const problem=employeeProblem(agent);if(problem)throw fail(400,problem);return agent;}
  app.post('/api/campaigns/:id/check',async(req,res)=>{
    const agent=await campaignAgent(req.params.id);
    const contacts=await query(db.from('calling_contacts').select('*').eq('campaign_id',req.params.id).eq('call_status','pending'));
    if(!contacts.length)throw fail(400,'Upload a pending test contact first.');
    const preview=await outperoRequest(config,'/calls',{method:'POST',body:{...callPayload(contacts[0],agent,undefined),dry_run:true}});
    res.json(preview);
  });
  app.get('/api/campaigns/:id',async(req,res)=>{
    const c=await campaign(req.params.id);const [qs,contacts]=await Promise.all([questions(c.id),query(db.from('calling_contacts').select('call_status').eq('campaign_id',c.id))]);
    res.json({...c,questions:qs,counts:contacts.reduce((a,c)=>(a[c.call_status]=(a[c.call_status]||0)+1,a),{})});
  });
  app.put('/api/campaigns/:id/questions',async(req,res)=>{
    const data=z.object({questions:z.array(question).min(1).max(15)}).parse(req.body);
    res.json(await rpc(db,'calling_mutate',{p_action:'questions',p_id:req.params.id,p_data:data}));
  });
  app.get('/api/campaigns/:id/script',async(req,res)=>{const c=await campaign(req.params.id);res.json({script:generateScript(c,await questions(c.id)),revision:c.revision});});
  app.get('/api/calling/sample',(_req,res)=>res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('feedback-contacts.xlsx').send(sampleWorkbook()));
  app.post('/api/campaigns/:id/upload',upload.single('file'),async(req,res)=>{
    if(!req.file||!(/\.xlsx?$/i.test(req.file.originalname)))throw fail(400,'Choose an .xlsx or .xls file.');
    const parsed=parseContacts(req.file.buffer);
    const result=await rpc(db,'calling_mutate',{p_action:'upload',p_id:req.params.id,p_data:{contacts:parsed.good,max_contacts:config.maxContacts}});
    res.json({...result,duplicates:result.duplicates+parsed.duplicates,rejected:parsed.rejected});
  });
  app.post('/api/campaigns/:id/start',async(req,res)=>{
    const ready=readiness(config);if(!ready.ready)throw fail(503,'Complete calling setup: '+ready.missing.join('; '));
    const data=z.object({revision:z.number().int().positive(),consent_confirmed:z.literal(true),script_confirmed:z.literal(true)}).parse(req.body);
    let allowed=config.allowedPhones;
    if(config.mode==='api'){
      const agent=await campaignAgent(req.params.id);
      const contacts=await query(db.from('calling_contacts').select('*').eq('campaign_id',req.params.id).eq('call_status','pending'));
      for(const contact of contacts){if(!/^\+91[6-9]\d{9}$/.test(contact.phone))throw fail(400,'Outpero requires valid Indian mobile numbers.');callPayload(contact,agent,undefined);}
      if(!allowed.length)allowed=contacts.map(c=>c.phone);
    }
    res.status(202).json(await rpc(db,'calling_mutate',{p_action:'start',p_id:req.params.id,p_data:{revision:data.revision,actor:req.admin.id,allowed_phones:allowed}}));
  });
  for(const action of ['pause','retry'])app.post(`/api/campaigns/:id/${action}`,async(req,res)=>res.json(await rpc(db,'calling_mutate',{p_action:action,p_id:req.params.id,p_data:{}})));
  app.get('/api/campaigns/:id/results',async(req,res)=>{
    const c=await campaign(req.params.id);
    const contacts=await query(db.from('calling_contacts').select('*,calling_calls(*,calling_feedback(*))').eq('campaign_id',c.id).order('created_at'));
    const rows=contacts.map(contact=>{const calls=contact.calling_calls.sort((a,b)=>b.created_at.localeCompare(a.created_at));return {...contact,calling_calls:undefined,calls,latest:calls[0]||null,feedback:calls[0]?.calling_feedback?.[0]||null};});
    const ratings=rows.flatMap(r=>r.feedback?.rating!=null?[r.feedback.rating]:[]);
    res.json({campaign:c,contacts:rows,summary:{total:rows.length,called:rows.filter(r=>r.calls.length).length,completed:rows.filter(r=>r.call_status==='completed').length,averageRating:ratings.length?Number((ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1)):null,positive:rows.filter(r=>r.feedback?.sentiment==='positive').length,negative:rows.filter(r=>r.feedback?.sentiment==='negative').length}});
  });
  if(config.serveFrontend){const dir=fileURLToPath(new URL('../dist/',import.meta.url));app.use(express.static(dir));app.get(/^\/(?!api(?:\/|$)).*/,(_req,res)=>res.sendFile(dir+'index.html'));}
  app.use((_req,res)=>res.status(404).json({error:'API route not found.'}));
  app.use((error,_req,res,_next)=>{
    if(error instanceof z.ZodError)return res.status(400).json({error:error.issues.map(i=>i.message).join(' ')});
    if(error instanceof multer.MulterError)return res.status(400).json({error:'Upload one Excel file, at most 2 MB.'});
    if(error.code==='P0002')return res.status(404).json({error:'Campaign not found.'});
    if(error.code==='22023')return res.status(409).json({error:error.message});
    if(error.status&&error.status<500)return res.status(error.status).json({error:error.message});
    if([502,503].includes(error.status))return res.status(error.status).json({error:error.message});
    if(['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code))return res.status(503).json({error:'Run the updated supabase/calling.sql in the Supabase SQL Editor.'});
    res.status(500).json({error:'The request could not be saved. Check the backend database configuration.'});
  });
  return app;
}
