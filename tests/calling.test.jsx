import React from 'react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {render,screen,within,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Calling,{Campaign} from '../src/admin/Calling';
import {callingRequest} from '../src/callingApi';
vi.mock('../src/callingApi',()=>({callingApiConfigured:true,callingRequest:vi.fn(),saveBlob:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeEach(()=>{vi.clearAllMocks();});
const question={id:'q1',question_text:'How was college?',answer_type:'text',choices:[],required:true};
const c={id:'c1',name:'Parent feedback',language:'te',status:'draft',revision:2,questions:[question]};
const contact={id:'p1',name:'Parent One',phone:'+919876543210',call_status:'pending',calls:[],latest:null,feedback:null};
const result=(status='draft',contacts=[contact])=>({campaign:{...c,status},contacts,summary:{total:contacts.length,called:0,completed:0,averageRating:null,positive:0,negative:0}});

test('section calling lists saved campaigns and creates a campaign with language and introduction',async()=>{
 const user=userEvent.setup();const calls=[];
 callingRequest.mockImplementation(async(path,options={})=>{
  calls.push([path,options]);
  if(path.startsWith('/campaigns?'))return [];
  if(path==='/calling/config')return {ready:false,missing:['Outpero setup'],maxContacts:5};
  if(path==='/campaigns')return c;
  if(path.endsWith('/results'))return result();
  return c;
 });
 render(<Calling section={{id:'s1'}}/>);
 await screen.findByText('No calling campaigns');
 await user.click(screen.getByRole('button',{name:'Create campaign'}));
 const dialog=screen.getByRole('dialog');
 await user.clear(within(dialog).getByLabelText('Campaign name'));
 await user.type(within(dialog).getByLabelText('Campaign name'),'Parent feedback');
 await user.selectOptions(within(dialog).getByLabelText('Language'),'te');
 await user.clear(within(dialog).getByLabelText('Introduction (optional)'));
 await user.type(within(dialog).getByLabelText('Introduction (optional)'),'A quick college check-in.');
 await user.click(within(dialog).getByRole('button',{name:'Create campaign'}));
 await screen.findByRole('heading',{name:'Parent feedback'});
 expect(calls.find(([path])=>path==='/campaigns')[1].body).toEqual({section_id:'s1',name:'Parent feedback',language:'te',intro_message:'A quick college check-in.'});
});
test('questions save, upload rejection report, script and consent gate start; results show call details',async()=>{
 const user=userEvent.setup();let state=result();let current={...c};
 callingRequest.mockImplementation(async(path,options={})=>{
  if(path.endsWith('/questions')){current={...current,revision:3};return {saved:1};}
  if(path.endsWith('/upload'))return {inserted:1,duplicates:1,rejected:[{row:4,reason:'Invalid phone number'}]};
  if(path.endsWith('/script'))return {script:'Ask feedback one question at a time.',revision:current.revision};
  if(path.endsWith('/start')){state=result('running');return state.campaign;}
  if(path.endsWith('/pause')){state=result('paused');return state.campaign;}
  if(path.endsWith('/results'))return state;
  return current;
 });
 render(<Campaign id="c1" config={{ready:true,maxContacts:5}} onBack={()=>{}}/>);
 await screen.findByRole('heading',{name:'Parent feedback'});
 expect(screen.getByRole('button',{name:'Start calls'}).disabled).toBe(true);
 await user.type(screen.getByLabelText('Question 1'),' Any concerns?');
 expect(screen.getByRole('button',{name:'Generate script'}).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Save questions'}));
 await screen.findByText('Questions saved.');
 await user.upload(screen.getByLabelText('Upload Excel (.xlsx or .xls, up to 2 MB)'),new File(['test'],'parents.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 await screen.findByText('Row 4: Invalid phone number');
 expect(screen.getByText('1 added · 1 duplicates skipped · 1 rejected')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Generate script'}));
 await screen.findByText('Ask feedback one question at a time.');
 await user.click(screen.getByLabelText('I pasted this campaign’s current script and language into Outpero.'));
 expect(screen.getByRole('button',{name:'Start calls'}).disabled).toBe(true);
 await user.click(screen.getByLabelText('These test contacts agreed to receive this call.'));
 await user.click(screen.getByRole('button',{name:'Start calls'}));
 await screen.findByRole('heading',{name:'Contact feedback'});
 expect(callingRequest.mock.calls.find(([path])=>path.endsWith('/start'))[1].body).toEqual({revision:3,consent_confirmed:true,script_confirmed:true});
 await user.click(screen.getByRole('button',{name:'Pause'}));
 await screen.findByText('Paused. Already submitted calls may still ring.');
 const feedback={summary:'Parent is satisfied.',transcript:'The teaching has been helpful.',answers:[{question_id:'q1',question:'How was college?',answered:true,answer:'Very good'}],rating:4,sentiment:'positive',recording_url:'https://example.test/recording'};
 const call={id:'a1',status:'completed',duration_seconds:32,calling_feedback:[feedback]};
 state=result('completed',[{...contact,call_status:'completed',calls:[call],latest:call,feedback}]);
 await user.click(screen.getByRole('button',{name:'Refresh'}));
 await screen.findByText('Parent is satisfied.');
 await user.click(screen.getByRole('button',{name:'Parent One'}));
 const detail=screen.getByRole('dialog');expect(within(detail).getByText('Very good')).toBeTruthy();expect(within(detail).getByText('32 seconds')).toBeTruthy();expect(within(detail).getByText('The teaching has been helpful.')).toBeTruthy();
});
test('failed saving retains question changes and surfaces a retryable error',async()=>{
 const user=userEvent.setup();callingRequest.mockImplementation(async path=>{if(path.endsWith('/questions'))throw new Error('Database unavailable');if(path.endsWith('/results'))return result();return c;});
 render(<Campaign id="c1" config={{ready:false}} onBack={()=>{}}/>);
 await screen.findByLabelText('Question 1');await user.type(screen.getByLabelText('Question 1'),' Changed');await user.click(screen.getByRole('button',{name:'Save questions'}));
 await screen.findByText('Database unavailable');expect(screen.getByLabelText('Question 1').value).toBe('How was college? Changed');expect(screen.getByRole('button',{name:'Save questions'}).disabled).toBe(false);
});
test('results update automatically while a paused campaign still has an accepted call',async()=>{
 const user=userEvent.setup();let reads=0;
 callingRequest.mockImplementation(async path=>{
  if(!path.endsWith('/results'))return {...c,status:'paused'};
  reads++;
  if(reads===1)return result('paused',[{...contact,call_status:'calling'}]);
  const feedback={summary:'Completed without refresh',answers:[]};const call={id:'a1',status:'completed',calling_feedback:[feedback]};
  return result('completed',[{...contact,call_status:'completed',calls:[call],latest:call,feedback}]);
 });
 render(<Campaign id="c1" config={{ready:true}} onBack={()=>{}}/>);
 await screen.findByRole('heading',{name:'Parent feedback'});
 await user.click(screen.getByRole('tab',{name:/Live results/}));
 await waitFor(()=>expect(screen.getByText('Completed without refresh')).toBeTruthy(),{timeout:10000});
 expect(reads).toBeGreaterThanOrEqual(2);
});
test('direct API mode shows inbound agents as unavailable and saves an eligible outbound agent',async()=>{
 const user=userEvent.setup();let saved=false;
 callingRequest.mockImplementation(async(path,options={})=>{
  if(path==='/calling/agents')return [{id:'inbound',name:'Inbound agent',mode:'inbound',unavailable_reason:'Select an Instant/outbound agent.'},{id:'instant',name:'Feedback agent',mode:'instant',language:'te-IN',status:'working',unavailable_reason:null}];
  if(path.endsWith('/agent')){saved=true;return {...c,outpero_employee_id:'instant',revision:3};}
  if(path.endsWith('/check'))return {would_create:true,checks:[{name:'agent',ok:true}],warnings:[]};
  if(path.endsWith('/results'))return result();
  return c;
 });
 render(<Campaign id="c1" config={{mode:'api',ready:true}} onBack={()=>{}}/>);
 await screen.findByRole('option',{name:/Inbound agent/});expect(screen.getByRole('option',{name:/Inbound agent/}).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Start calls'}).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Save agent'}));await screen.findByText('Agent saved. Generate the script for this agent.');expect(saved).toBe(true);
 await user.click(screen.getByRole('button',{name:'Check without calling'}));await screen.findByText('Outpero checks passed. No call was placed.');
});
