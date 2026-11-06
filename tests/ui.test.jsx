import React, {useState} from 'react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,waitFor,cleanup,within,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {readFileSync} from 'node:fs';

const auth=vi.hoisted(()=>({getSession:vi.fn(),getUser:vi.fn(),onAuthStateChange:vi.fn(),signOut:vi.fn(),signInWithPassword:vi.fn()}));
vi.mock('../src/auth',()=>({supabase:{auth},isAdmin:user=>user?.app_metadata?.role==='admin'}));
import AdminPortal,{Login} from '../src/admin/AdminPortal';
import CampaignWizard from '../src/admin/Wizard';
import Workspace from '../src/admin/Workspace';
import SectionWorkspace,{CampaignDetail,SectionHistory} from '../src/admin/SectionWorkspace';
import * as db from '../src/supabaseData';
vi.mock('../src/supabaseData');
import {newDraft,buildCampaign} from '../src/workflow';
import {sampleCSV} from '../src/data';
import Faculty from '../src/admin/Faculty';
import {DashboardMotion,AnimatedNumber,AnimatedBar} from '../src/admin/DashboardMotion';
const summary={totals:{students:0,branches:0,sections:0,faculty:0,campaigns:0,openFeedback:0},attendance:{present:0,absent:0,late:0},feedback:{pending:0,reviewed:0,resolved:0},campaigns:{mentoring:0,feedback:0},branches:[],activity:[{date:'2026-11-06',count:0}],period:{days:30}};
async function goToBranches(user){await user.click((await screen.findAllByRole('button',{name:'View branches'}))[0]);}

beforeEach(()=>{
  vi.resetAllMocks();db.fetchDashboard.mockResolvedValue(summary);db.fetchCollegeHistory.mockResolvedValue({items:[],hasMore:false});db.fetchFaculty.mockResolvedValue([]);db.fetchBranches.mockResolvedValue([]);db.fetchSections.mockResolvedValue([]);db.fetchStudents.mockResolvedValue([]);db.fetchSectionCampaigns.mockResolvedValue([]);db.fetchSectionHistory.mockResolvedValue({items:[],hasMore:false});db.fetchAttendance.mockResolvedValue([]);db.fetchFeedback.mockResolvedValue([]);localStorage.clear();window.location.hash='';window.scrollTo=vi.fn();
  auth.getSession.mockResolvedValue({data:{session:null}});
  auth.getUser.mockResolvedValue({data:{user:null}});
  auth.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
  auth.signOut.mockResolvedValue({error:null});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

const branch={id:'b1',name:'Computer Science',code:'CSE'};
const section={id:'s1',name:'A',branch_id:'b1',year:'2nd Year'};
const student={id:'student-1',student_id:'CSE001',student_name:'Student One',parent_name:'Parent One',phone:'9000000000',attendance:92,marks:80,language:'English',feedback_topic:'Class'};
const admin={id:'admin-1',email:'admin@example.com'};
describe('college dashboard',()=>{
 it('shows aggregate charts, changes the chart period, and opens paginated college history',async()=>{
  const user=userEvent.setup();
  db.fetchDashboard.mockResolvedValue({...summary,totals:{...summary.totals,students:120,branches:1},branches:[{...branch,students:120,sections:3,faculty:8}],activity:[{date:'2026-11-05',count:2},{date:'2026-11-06',count:4}]});
  db.fetchCollegeHistory.mockResolvedValueOnce({items:[{id:'a1',kind:'feedback',description:'Latest concern reviewed',created_at:'2026-11-06T05:00:00Z',sections:{...section,branches:branch}}],hasMore:true}).mockResolvedValueOnce({items:[{id:'a2',kind:'section',description:'Older section created',created_at:'2026-11-05T05:00:00Z'}],hasMore:false});
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  expect(await screen.findByRole('img',{name:'6 saved activities during the selected period'})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Open CSE: 120 students, 3 sections, 8 faculty/})).toBeTruthy();
  expect(screen.getByText('Calling is not connected.')).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Chart period'),'7');await waitFor(()=>expect(db.fetchDashboard).toHaveBeenLastCalledWith(7));
  await screen.findByText('Latest concern reviewed');await user.click(screen.getByRole('button',{name:'Load older history'}));
  await screen.findByText('Older section created');expect(db.fetchCollegeHistory).toHaveBeenLastCalledWith(1);
  await user.click(screen.getByRole('button',{name:'CSE / 2nd Year / Section A'}));
  expect(await screen.findByRole('heading',{name:'Section A'})).toBeTruthy();
  expect(db.fetchStudents).toHaveBeenCalledWith('s1');
 });
 it('opens the section directly and keeps modules and saved setups inside its page',async()=>{
  const user=userEvent.setup();db.fetchBranches.mockResolvedValue([branch]);db.fetchSections.mockResolvedValue([section]);
  db.fetchSectionCampaigns.mockResolvedValue([{id:'c1',name:'Uploaded feedback list',student_count:2,created_at:'2026-11-06T05:00:00Z',details:{}}]);
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  await user.click(screen.getByRole('button',{name:'Open navigation'}));
  const dialog=screen.getByRole('dialog');expect(within(dialog).queryByRole('button',{name:'Add branch'})).toBeNull();
  await user.click(within(dialog).getByRole('button',{name:'Branches'}));
  await user.selectOptions(screen.getByLabelText('Navigation branch'),'b1');
  expect(screen.queryByLabelText('Navigation section')).toBeNull();
  await user.selectOptions(screen.getByLabelText('Navigation year'),'2nd Year');
  await waitFor(()=>expect(screen.getByLabelText('Navigation section').disabled).toBe(false));
  await user.selectOptions(screen.getByLabelText('Navigation section'),'s1');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(await screen.findByRole('heading',{name:'Section A'})).toBeTruthy();
  expect(await screen.findByRole('button',{name:/Uploaded feedback list/})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Open navigation'}));
  expect(within(screen.getByRole('dialog')).queryByRole('button',{name:'Calling'})).toBeNull();
  expect(within(screen.getByRole('dialog')).queryByText('SECTION MODULES')).toBeNull();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('tab',{name:'Calling'}));
  expect(await screen.findByRole('heading',{name:'Calling'})).toBeTruthy();
  expect(screen.getByRole('tab',{name:'Calling'}).getAttribute('aria-selected')).toBe('true');
  await user.click(screen.getByRole('button',{name:'Feedback calling'}));
  expect(screen.getByRole('heading',{name:'Add your students.'})).toBeTruthy();
 });
 it('adds faculty to Supabase and retains form values after a failed save',async()=>{
  const user=userEvent.setup();db.fetchBranches.mockResolvedValue([branch]);
  db.addFaculty.mockRejectedValueOnce(new Error('This entry already exists.')).mockResolvedValueOnce({id:'f1',name:'Anita Rao',email:'anita@college.edu',branch_id:'b1',designation:'Professor',branches:branch});
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  await user.click(screen.getByRole('button',{name:'Open navigation'}));await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Faculty'}));
  await screen.findByText('No faculty added yet');await user.click(screen.getByRole('button',{name:'Add faculty'}));
  const form=within(screen.getByRole('dialog',{name:'Add faculty'}));
  await user.type(form.getByLabelText('Full name'),'Anita Rao');await user.type(form.getByLabelText('Email address'),'anita@college.edu');await user.selectOptions(form.getByLabelText('Branch'),'b1');await user.type(form.getByLabelText('Designation'),'Professor');
  await user.click(screen.getByRole('button',{name:'Save faculty'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Full name').value).toBe('Anita Rao');
  await user.click(screen.getByRole('button',{name:'Save faculty'}));await screen.findByRole('link',{name:'anita@college.edu'});
  expect(db.addFaculty).toHaveBeenLastCalledWith({name:'Anita Rao',email:'anita@college.edu',branch_id:'b1',designation:'Professor'});
  await user.type(screen.getByLabelText('Search faculty'),'no match');expect(screen.getByText('No matching faculty')).toBeTruthy();
  cleanup();db.fetchFaculty.mockResolvedValue([{id:'f1',name:'Anita Rao',email:'anita@college.edu',branch_id:'b1',designation:'Professor',branches:branch}]);
  render(<Faculty branches={[branch]} onBranches={vi.fn()}/>);expect(await screen.findByText('Anita Rao')).toBeTruthy();
 });
 it('keeps navigation hidden, traps focus when open, and restores the menu button on Escape',async()=>{
  const user=userEvent.setup();render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  await goToBranches(user);await screen.findByText('Add your first branch');
  expect(screen.queryByRole('navigation',{name:'Admin navigation'})).toBeNull();
  const menu=screen.getByRole('button',{name:'Open navigation'});
  await user.click(menu);
  const dialog=screen.getByRole('dialog',{name:'Navigation'});
  expect(within(dialog).getByRole('navigation',{name:'Admin navigation'})).toBeTruthy();
  within(dialog).getByRole('button',{name:'Sign out'}).focus();
  expect(document.activeElement).toBe(within(dialog).getByRole('button',{name:'Sign out'}));
  await user.tab();expect(document.activeElement).toBe(within(dialog).getByRole('button',{name:'Close dialog'}));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(menu);
 });
 it('adds a branch and a year-scoped section, then opens modules with history alongside',async()=>{
  const user=userEvent.setup();db.addBranch.mockResolvedValue(branch);db.addSection.mockResolvedValue(section);
  db.fetchSectionHistory.mockResolvedValue({items:[{id:'h1',kind:'section',description:'Section A created',created_at:'2026-11-04T05:00:00Z'}],hasMore:false});
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  await goToBranches(user);await screen.findByText('Add your first branch');
  await user.click(screen.getByRole('button',{name:'Add branch'}));
  await user.type(screen.getByLabelText('Branch name'),'Computer Science');await user.type(screen.getByLabelText('Branch code'),'cse');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add branch'}));
  expect(db.addBranch).toHaveBeenCalledWith('Computer Science','CSE');
  await user.click(await screen.findByRole('button',{name:/CSE Computer Science View years/}));
  expect(screen.queryByRole('button',{name:'Add section'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'2nd Year'}));
  expect(db.fetchSections).toHaveBeenCalledWith('b1','2nd Year');
  await screen.findByText('No sections yet');
  await user.click(screen.getByRole('button',{name:'Add section'}));await user.type(screen.getByLabelText('Section name'),'A');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add section'}));
  expect(db.addSection).toHaveBeenCalledWith('b1','2nd Year','A');
  await user.click(await screen.findByRole('button',{name:'Open section A'}));
  expect(await screen.findByRole('button',{name:/Mentoring & attendance/})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Feedback Record concerns/})).toBeTruthy();
  expect(within(screen.getByRole('complementary',{name:'Section history'})).getByText('Section A created')).toBeTruthy();
  expect(db.fetchStudents).toHaveBeenCalledWith('s1');expect(db.fetchSectionHistory).toHaveBeenCalledWith('s1',0);
 });
 it('retains branch details after a failed save and allows correction',async()=>{
  const user=userEvent.setup();db.addBranch.mockRejectedValueOnce(new Error('This entry already exists.')).mockResolvedValueOnce(branch);
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);await goToBranches(user);await screen.findByText('Add your first branch');
  await user.click(screen.getByRole('button',{name:'Add branch'}));await user.type(screen.getByLabelText('Branch name'),'Computer Science');await user.type(screen.getByLabelText('Branch code'),'CSE');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add branch'}));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Branch name').value).toBe('Computer Science');
  await user.clear(screen.getByLabelText('Branch code'));await user.type(screen.getByLabelText('Branch code'),'CSE-AI');
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Add branch'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(db.addBranch).toHaveBeenLastCalledWith('Computer Science','CSE-AI');
 });
 it('ignores stale section responses when the year changes',async()=>{
  const user=userEvent.setup();let resolveOld;db.fetchBranches.mockResolvedValue([branch]);
  db.fetchSections.mockImplementation((_,year)=>year==='1st Year'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve([{...section,name:'B'}]));
  render(<Workspace user={admin} onSignOut={vi.fn()}/>);
  await goToBranches(user);
  await user.click(await screen.findByRole('button',{name:/CSE Computer Science View years/}));
  await user.click(screen.getByRole('button',{name:'1st Year'}));await user.click(screen.getByRole('button',{name:'2nd Year'}));
  await screen.findByRole('button',{name:'Open section B'});
  await act(async()=>resolveOld([{...section,name:'OLD'}]));
  expect(screen.queryByText('Section OLD')).toBeNull();expect(screen.getByText('Section B')).toBeTruthy();
 });
 it('loads older section history without losing the current entries',async()=>{
  const user=userEvent.setup();db.fetchSectionHistory.mockResolvedValueOnce({items:[{id:'h1',description:'Latest record',kind:'feedback',created_at:'2026-11-04T05:00:00Z'}],hasMore:true}).mockResolvedValueOnce({items:[{id:'h2',description:'Older record',kind:'section',created_at:'2026-11-03T05:00:00Z'}],hasMore:false});
  render(<SectionHistory sectionId="s1" revision={0}/>);await screen.findByText('Latest record');
  await user.click(screen.getByRole('button',{name:'Load older activity'}));await screen.findByText('Older record');
  expect(screen.getByText('Latest record')).toBeTruthy();expect(db.fetchSectionHistory).toHaveBeenLastCalledWith('s1',1);
 });
 it('preserves unsaved attendance after a network failure and retries the same selected date',async()=>{
  const user=userEvent.setup();db.fetchStudents.mockResolvedValue([student]);db.bulkMarkAttendance.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(null);
  render(<SectionWorkspace section={section} branch={branch} year="2nd Year" onBack={vi.fn()}/>);
  await screen.findByRole('button',{name:/Mentoring & attendance/});await user.click(screen.getByRole('tab',{name:'Attendance'}));
  const select=await screen.findByLabelText('Attendance for Student One');const date=screen.getByLabelText('Attendance date').value;
  await user.selectOptions(select,'absent');await user.click(screen.getByRole('button',{name:'Save attendance'}));
  expect(await screen.findByText('Connection interrupted')).toBeTruthy();expect(screen.getByLabelText('Attendance for Student One').value).toBe('absent');
  await user.click(screen.getByRole('button',{name:'Save attendance'}));
  await screen.findByText('Attendance saved.');expect(db.bulkMarkAttendance).toHaveBeenLastCalledWith([{student_id:'student-1',date,status:'absent'}]);
 });
 it('blocks edits after a failed attendance load until the saved records are retrieved',async()=>{
  const user=userEvent.setup();db.fetchStudents.mockResolvedValue([student]);
  db.fetchAttendance.mockRejectedValueOnce(new Error('Attendance unavailable')).mockResolvedValueOnce([{student_id:'student-1',status:'present'}]);
  render(<SectionWorkspace section={section} branch={branch} year="2nd Year" onBack={vi.fn()}/>);
  await screen.findByRole('button',{name:/Mentoring & attendance/});await user.click(screen.getByRole('tab',{name:'Attendance'}));
  expect(await screen.findByText('Attendance unavailable')).toBeTruthy();expect(screen.queryByLabelText('Attendance for Student One')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Retry loading'}));
  expect((await screen.findByLabelText('Attendance for Student One')).value).toBe('present');
 });
 it('validates and saves an uploaded student list to its selected section',async()=>{
  const user=userEvent.setup();db.addStudents.mockResolvedValue(null);
  render(<SectionWorkspace section={section} branch={branch} year="2nd Year" onBack={vi.fn()}/>);
  await screen.findByRole('button',{name:/Mentoring & attendance/});await user.click(screen.getByRole('tab',{name:'Students'}));
  await user.click(screen.getByRole('button',{name:'Upload students'}));
  await user.upload(screen.getByLabelText('Upload student file'),new File([sampleCSV],'students.csv',{type:'text/csv'}));
  expect(screen.getByRole('button',{name:'Save students to section'}).disabled).toBe(true);
  await user.click(await screen.findByRole('button',{name:'Confirm student list'}));
  await user.click(screen.getByRole('button',{name:'Save students to section'}));
  expect(db.addStudents).toHaveBeenCalledWith('s1',expect.arrayContaining([expect.objectContaining({student_id:'CSE001'})]));
  expect(await screen.findByText('Student list saved.')).toBeTruthy();
 });
 it('saves feedback and advances the concern through review to resolution',async()=>{
  const user=userEvent.setup();const feedback={id:'f1',feedback_type:'Transport',content:'Bus arrives late',status:'pending',created_at:'2026-11-04T05:00:00Z'};
  db.addFeedback.mockImplementation(async()=>{db.fetchFeedback.mockResolvedValue([feedback]);return feedback;});
  db.updateFeedbackStatus.mockImplementation(async(id,status)=>({...feedback,status}));
  render(<SectionWorkspace section={section} branch={branch} year="2nd Year" onBack={vi.fn()}/>);
  await screen.findByRole('button',{name:/Mentoring & attendance/});await user.click(screen.getByRole('tab',{name:'Feedback'}));
  await user.click(screen.getByRole('button',{name:'Add feedback'}));await user.selectOptions(screen.getByLabelText('Topic'),'Transport');await user.type(screen.getByLabelText('Feedback'),'Bus arrives late');
  await user.click(screen.getByRole('button',{name:'Save feedback'}));
  expect(db.addFeedback).toHaveBeenCalledWith('s1','','Transport','Bus arrives late');await screen.findByText('Bus arrives late');
  await user.click(screen.getByRole('button',{name:'Mark reviewed'}));await user.click(await screen.findByRole('button',{name:'Mark resolved'}));
  await screen.findByText('resolved');expect(db.updateFeedbackStatus).toHaveBeenLastCalledWith('f1','resolved');
 });
});

describe('dashboard motion',()=>{
 it('counts and fills from zero to the exact saved values and cancels pending frames',()=>{
  let tick;
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  const request=vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{tick=callback;return 1;});
  const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
  const {container,unmount}=render(<DashboardMotion><AnimatedNumber value={120}/><div className="test-bar"><AnimatedBar percent={80} color="blue"/></div></DashboardMotion>);
  const visible=()=>container.querySelector('.animated-number [aria-hidden=true]').textContent;
  expect(visible()).toBe('0');expect(container.querySelector('.test-bar>span').style.width).toBe('0%');
  act(()=>tick(0));act(()=>tick(600));expect(Number(visible())).toBeGreaterThan(0);expect(Number(visible())).toBeLessThan(120);
  act(()=>tick(1200));expect(visible()).toBe('120');expect(container.querySelector('.test-bar>span').style.width).toBe('80%');
  expect(request).toHaveBeenCalled();unmount();expect(cancel).toHaveBeenCalled();
 });
 it('shows final totals immediately when reduced motion is preferred',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  const request=vi.spyOn(window,'requestAnimationFrame');
  const {container}=render(<DashboardMotion><AnimatedNumber value={24}/></DashboardMotion>);
  expect(container.querySelector('[aria-hidden=true]').textContent).toBe('24');expect(request).not.toHaveBeenCalled();
 });
});

describe('Supabase admin login',()=>{
  it('focuses inputs from the whole field and keeps the password toggle independent',async()=>{
    const user=userEvent.setup();
    const client={auth:{signInWithPassword:vi.fn()}};
    render(<Login client={client}/>);
    const email=screen.getByLabelText('Email address');
    const password=screen.getByLabelText('Password');
    await user.click(email.parentElement);
    expect(document.activeElement).toBe(email);
    await user.keyboard('admin@example.com');
    expect(email.value).toBe('admin@example.com');
    await user.tab();
    expect(document.activeElement).toBe(password);
    await user.click(password.parentElement);
    expect(document.activeElement).toBe(password);
    await user.keyboard('example-password');
    await user.click(screen.getByRole('button',{name:'Show password'}));
    expect(password.type).toBe('text');
    expect(password.value).toBe('example-password');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Hide password'}));
    expect(password.type).toBe('password');
  });
  it('disables sign-in until configuration is present',()=>{
    render(<Login client={null}/>);
    expect(screen.getByRole('button',{name:'Sign in'}).disabled).toBe(true);
    expect(screen.queryByText('College dashboard')).toBeNull();
  });
  it('uses Supabase email/password and shows failed credentials',async()=>{
    const user=userEvent.setup();const client={auth:{signInWithPassword:vi.fn().mockResolvedValue({error:{code:'invalid_credentials'}})}};
    render(<Login client={client}/>);
    await user.type(screen.getByLabelText('Email address'),'admin@example.com');
    await user.type(screen.getByLabelText('Password'),'bad-password');
    await user.click(screen.getByRole('button',{name:'Sign in'}));
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({email:'admin@example.com',password:'bad-password'});
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Email or password is incorrect.')).toBeTruthy();
  });
  it('blocks signed-in users without trusted admin metadata',async()=>{
    auth.getSession.mockResolvedValue({data:{session:{access_token:'test'}}});
    auth.getUser.mockResolvedValue({data:{user:{id:'student',email:'student@example.com',user_metadata:{role:'admin'}}}});
    render(<AdminPortal/>);
    expect(await screen.findByText('Admin access required')).toBeTruthy();
    expect(screen.queryByText('College dashboard')).toBeNull();
  });
  it('opens the dashboard only after verifying the admin user',async()=>{
    auth.getSession.mockResolvedValue({data:{session:{access_token:'test'}}});
    auth.getUser.mockResolvedValue({data:{user:{id:'admin-1',email:'admin@example.com',app_metadata:{role:'admin'}}}});
    render(<AdminPortal/>);
    expect(await screen.findByText('College dashboard')).toBeTruthy();
    expect(auth.getUser).toHaveBeenCalled();
  });
});

function WizardHarness({onConfirm,initial}) {
  const [draft,setDraft]=useState(initial||newDraft());const [step,setStep]=useState(initial?4:0);
  return <CampaignWizard draft={draft} setDraft={setDraft} step={step} setStep={setStep} onConfirm={()=>onConfirm(buildCampaign(draft,'test-campaign','2026-11-02T12:00:00Z'))}/>;
}
describe('campaign workflow',()=>{
  it('selects a class, corrects an upload, confirms students, and prepares a campaign',async()=>{
    const user=userEvent.setup();const confirmed=vi.fn();
    render(<WizardHarness onConfirm={confirmed}/>);
    const next=()=>screen.getByRole('button',{name:'Continue'});
    expect(next().disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'CSE Computer Science'}));await user.click(next());
    await user.click(screen.getByRole('button',{name:/2nd year/}));await user.click(next());
    await user.click(screen.getByRole('button',{name:'Section A'}));await user.click(next());
    await user.click(screen.getByRole('button',{name:/Mentoring & attendance/}));await user.click(next());
    await user.upload(screen.getByLabelText('Upload student file'),new File([sampleCSV.replace('9000000000','123')],'students.csv',{type:'text/csv'}));
    const confirmStudents=await screen.findByRole('button',{name:'Confirm student list'});
    expect(confirmStudents.disabled).toBe(true);expect(next().disabled).toBe(true);
    await user.clear(screen.getByLabelText('Phone, row 1'));await user.type(screen.getByLabelText('Phone, row 1'),'9876543210');
    await user.click(screen.getByRole('button',{name:'Confirm student list'}));expect(next().disabled).toBe(false);
    await user.type(screen.getByLabelText('Student name, row 1'),' Edited');expect(next().disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'Confirm student list'}));await user.click(next());
    await user.click(screen.getByRole('button',{name:'Add question'}));expect(next().disabled).toBe(true);
    await user.type(screen.getByLabelText('Question 3'),'Any other concerns?');await user.click(next());
    expect(screen.getByRole('button',{name:'Confirm campaign'}).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Confirm campaign'}));
    expect(confirmed).toHaveBeenCalledOnce();const campaign=confirmed.mock.calls[0][0];
    expect(campaign.students).toHaveLength(2);expect(campaign.questions).toHaveLength(3);expect(campaign.calls).toEqual([]);expect(campaign.status).toBe('Prepared');
    cleanup();render(<CampaignDetail campaign={campaign}/>);
    expect(screen.getByRole('button',{name:'Start calling'}).disabled).toBe(true);
    await user.click(screen.getByRole('tab',{name:'Call history'}));expect(screen.getByText('No calls yet.')).toBeTruthy();
  });
  it('reads an actual XLSX worksheet into the editable preview',async()=>{
    const user=userEvent.setup();const initial={...newDraft(),department:'CSE',year:'1st year',section:'A',type:'Feedback'};
    render(<WizardHarness initial={initial} onConfirm={vi.fn()}/>);
    const bytes=readFileSync('tests/fixtures/students.xlsx');
    await user.upload(screen.getByLabelText('Upload student file'),new File([bytes],'students.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    await waitFor(()=>expect(screen.getByLabelText('Student name, row 1').value).toBe('Sample Student'));
    expect(screen.getByRole('button',{name:'Confirm student list'}).disabled).toBe(false);
  });
});
