import React, {useEffect,useRef,useState} from 'react';
import {Plus,ArrowLeft,ArrowRight,Building2,GraduationCap,Search,Menu,ChevronDown,ContactRound,LogOut,LayoutDashboard,ArrowUpRight,RefreshCw} from 'lucide-react';
import {Logo} from '../Brand';
import {fetchBranches,addBranch,fetchSections,addSection} from '../supabaseData';
import {academicYears} from '../college';
import Dialog from './Dialog';
import SectionWorkspace from './SectionWorkspace';
import Dashboard from './Dashboard';
import Faculty from './Faculty';
import {Notice,Loading,Empty} from './Ui';

function AddDialog({branch,year,onClose,onAdded}) {
  const isSection=Boolean(branch);
  const [name,setName]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  async function submit(e){
    e.preventDefault();if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{const entry=isSection?await addSection(branch.id,year,name):await addBranch(name,code);onAdded(entry);onClose();}
    catch(e){setError(e.message);setBusy(false);pending.current=false;}
  }
  return <Dialog title={isSection?'Add section':'Add branch'} onClose={onClose} busy={busy}>
    {isSection&&<p className="dialog-context">{branch.name} / {year}</p>}
    <form onSubmit={submit} className="college-form">
      <label htmlFor="entry-name">{isSection?'Section name':'Branch name'}</label>
      <input id="entry-name" value={name} onChange={e=>setName(e.target.value)} placeholder={isSection?'e.g. A':'e.g. Computer Science and Engineering'} required maxLength={isSection?10:100} disabled={busy}/>
      {!isSection&&<><label htmlFor="entry-code">Branch code</label><input id="entry-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. CSE" required maxLength={20} disabled={busy}/></>}
      <Notice error={error}/><div className="modal-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy||!name.trim()||(!isSection&&!code.trim())}>{busy?'Saving...':isSection?'Add section':'Add branch'}</button></div>
    </form>
  </Dialog>;
}
export default function Workspace({user,onSignOut}) {
  const [view,setView]=useState('dashboard'),[branchesOpen,setBranchesOpen]=useState(false),[activeTab,setActiveTab]=useState('overview');
  const [branches,setBranches]=useState([]),[sections,setSections]=useState([]);
  const [branch,setBranch]=useState(null),[year,setYear]=useState(''),[section,setSection]=useState(null);
  const [loading,setLoading]=useState(true),[sectionLoading,setSectionLoading]=useState(false);
  const [error,setError]=useState(''),[sectionError,setSectionError]=useState('');
  const [menu,setMenu]=useState(false),[modal,setModal]=useState(null),[query,setQuery]=useState(''),[retry,setRetry]=useState(0);
  const [signingOut,setSigningOut]=useState(false);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    fetchBranches().then(data=>{if(active)setBranches(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[retry]);
  useEffect(()=>{
    let active=true;setSections([]);setSectionError('');
    if(!branch||!year){setSectionLoading(false);return;}
    setSectionLoading(true);
    fetchSections(branch.id,year).then(data=>{if(active)setSections(data);}).catch(e=>{if(active)setSectionError(e.message);}).finally(()=>{if(active)setSectionLoading(false);});
    return()=>{active=false;};
  },[branch,year,retry]);
  function selectBranch(value,keepMenu=false){setView('branches');setBranch(value);setYear('');setSection(null);setActiveTab('overview');if(!keepMenu)setMenu(false);}
  function home(){setView('dashboard');setBranch(null);setYear('');setSection(null);setMenu(false);}
  function showBranches(){setView('branches');setBranch(null);setYear('');setSection(null);setMenu(false);}
  function showFaculty(){setView('faculty');setMenu(false);}
  function openSection(value){setSection(value);setActiveTab('overview');setView('branches');setMenu(false);}
  function openHistorySection(value){setBranch(value.branches||branches.find(b=>b.id===value.branch_id));setYear(value.year);openSection(value);}
  async function logout(){setSigningOut(true);try{await onSignOut();}catch{setError('Unable to sign out. Please retry.');setSigningOut(false);}}
  const filtered=branches.filter(b=>`${b.name} ${b.code}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="portal college-portal">
    <header className="college-topbar"><div className="college-topbar-left"><button className="icon-button menu-toggle" aria-label="Open navigation" aria-expanded={menu} onClick={()=>setMenu(true)}><Menu size={23}/></button><Logo/></div><div className="college-admin"><span>{(user.email||'A')[0].toUpperCase()}</span><div><b>Administrator</b><small>{user.email}</small></div></div></header>
    <main className="college-main">
      <nav className="college-breadcrumb" aria-label="Breadcrumb"><button onClick={home}>Dashboard</button>{view==='faculty'&&<><span>/</span><span>Faculty</span></>}{view==='branches'&&<><span>/</span><button onClick={showBranches}>Branches</button></>}{view==='branches'&&branch&&<><span>/</span><button onClick={()=>{setYear('');setSection(null);}}>{branch.code}</button></>}{view==='branches'&&year&&<><span>/</span><button onClick={()=>setSection(null)}>{year}</button></>}{view==='branches'&&section&&<><span>/</span><span>Section {section.name}</span></>}</nav>
      {view==='dashboard'?<Dashboard onBranches={showBranches} onFaculty={showFaculty} onBranch={selectBranch} onSection={openHistorySection}/>:view==='faculty'?<Faculty branches={branches} onBranches={showBranches}/>:!branch?<><div className="college-title"><div><span className="eyebrow">ACADEMIC ADMINISTRATION</span><h1>Branches</h1><p>Select a branch to manage students and parent communication.</p></div><button className="btn-primary" onClick={()=>setModal('branch')}><Plus size={18}/> Add branch</button></div>
        <div className="college-overview"><div><Building2 size={22}/><span><b>{loading?'--':branches.length}</b><small>Branches</small></span></div><div><GraduationCap size={23}/><span><b>4</b><small>Academic years</small></span></div><div className="college-overview-note"><span className={`connection-indicator ${error?'offline':''}`}/><span>{loading?'Connecting...':error?'Connection needs attention':'Connected to Supabase'}</span></div></div>
        <div className="college-section-heading"><h2>Branches</h2><label className="college-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search branches" aria-label="Search branches"/></label></div>
        <Notice error={error}/>{error&&<button className="btn-secondary" onClick={()=>setRetry(r=>r+1)}><RefreshCw size={16}/> Retry connection</button>}
        {loading?<Loading text="Loading branches..."/>:!error&&(filtered.length?<div className="branch-grid">{filtered.map(b=><button className="branch-card" key={b.id} onClick={()=>selectBranch(b)}><span className="branch-card-icon"><Building2 size={24}/></span><h3>{b.code}</h3><p>{b.name}</p><span className="branch-card-link">View years & sections <ArrowRight size={17}/></span></button>)}</div>:<Empty title={query?'No matching branches':'Add your first branch'}>{!query&&<p>Use Add branch to create a department.</p>}</Empty>)}</>:
      section?<SectionWorkspace key={section.id} section={section} branch={branch} year={year} onBack={()=>setSection(null)} activeTab={activeTab} onTabChange={setActiveTab}/>:
      <><div className="college-title"><div><span className="eyebrow">{branch.code}</span><h1>{branch.name}</h1><p>Choose an academic year and section.</p></div><button className="btn-secondary" onClick={showBranches}><ArrowLeft size={17}/> All branches</button></div><div className="year-panel"><h2>Academic year</h2><div className="year-chips">{academicYears.map(y=><button key={y} className={`year-chip ${year===y?'active':''}`} aria-pressed={year===y} onClick={()=>{setYear(y);setSection(null);}}><GraduationCap size={18}/>{y}</button>)}</div></div>
        {year&&<section className="sections-area"><div className="college-section-heading"><div><h2>Sections</h2><p>{branch.code} / {year}</p></div><button className="btn-primary" onClick={()=>setModal('section')}><Plus size={17}/> Add section</button></div><Notice error={sectionError}/>{sectionError&&<button className="btn-secondary" onClick={()=>setRetry(r=>r+1)}>Retry</button>}{sectionLoading?<Loading text="Loading sections..."/>:!sectionError&&(sections.length?<div className="section-grid">{sections.map(s=><button className="section-card-btn" aria-label={`Open section ${s.name}`} key={s.id} onClick={()=>openSection(s)}><span className="section-monogram">{s.name}</span><span><b>Section {s.name}</b><small>{branch.code} / {year}</small></span><ArrowRight size={18}/></button>)}</div>:<Empty title="No sections yet"><p>Add a section for {year}.</p></Empty>)}</section>}</>}
    </main><footer className="college-footer"><span>VIIT | Academic Administration</span><span>Parent communication & student support</span></footer>
    {menu&&<Dialog title="Navigation" className="navigation-drawer" onClose={()=>setMenu(false)}>
      <nav className="drawer-nav" aria-label="Admin navigation">
        <button className={view==='dashboard'?'nav-active':''} onClick={home}><LayoutDashboard size={20}/> Dashboard</button>
        <button className={view==='branches'?'nav-active':''} aria-expanded={branchesOpen} aria-controls="branch-navigation" onClick={()=>{setBranchesOpen(value=>!value);setView('branches');}}><Building2 size={20}/> Branches <ChevronDown size={17} className={branchesOpen?'chevron open':'chevron'}/></button>
        {branchesOpen&&<div id="branch-navigation" className="branch-navigation">
          <label htmlFor="nav-branch">Branch</label><select id="nav-branch" aria-label="Navigation branch" disabled={loading} value={branch?.id||''} onChange={e=>selectBranch(branches.find(b=>b.id===e.target.value)||null,true)}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}</select>
          {error&&<Notice error={error}/>}
          {branch&&<><label htmlFor="nav-year">Academic year</label><select id="nav-year" aria-label="Navigation year" value={year} onChange={e=>{setYear(e.target.value);setSection(null);}}><option value="">Select year</option>{academicYears.map(y=><option key={y}>{y}</option>)}</select></>}
          {branch&&year&&<><label htmlFor="nav-section">Section</label><select id="nav-section" aria-label="Navigation section" disabled={sectionLoading||Boolean(sectionError)} value={section?.id||''} onChange={e=>{const value=sections.find(s=>s.id===e.target.value);if(value)openSection(value);else setSection(null);}}><option value="">{sectionLoading?'Loading sections...':'Select section'}</option>{sections.map(s=><option key={s.id} value={s.id}>Section {s.name}</option>)}</select>{sectionError&&<Notice error={sectionError}/>}</>}
          <button className="manage-branches-link" onClick={showBranches}>Manage branches <ArrowRight size={14}/></button>
        </div>}
        <button className={view==='faculty'?'nav-active':''} onClick={showFaculty}><ContactRound size={20}/> Faculty</button>
        <a href="/"><ArrowUpRight size={18}/> College homepage</a>
        <button onClick={logout} disabled={signingOut}><LogOut size={18}/>{signingOut?'Signing out...':'Sign out'}</button>
      </nav>
    </Dialog>}
    {modal&&<AddDialog branch={modal==='section'?branch:null} year={year} onClose={()=>setModal(null)} onAdded={entry=>modal==='section'?setSections(prev=>[...prev,entry].sort((a,b)=>a.name.localeCompare(b.name))):setBranches(prev=>[...prev,entry].sort((a,b)=>a.name.localeCompare(b.name)))}/>}
  </div>;
}

