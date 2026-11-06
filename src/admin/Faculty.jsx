import React,{useEffect,useRef,useState} from 'react';
import {Plus,Search,Users,Mail} from 'lucide-react';
import {addFaculty,fetchFaculty} from '../supabaseData';
import Dialog from './Dialog';
import {Notice,Loading,Empty} from './Ui';

function FacultyForm({branches,onClose,onAdded}) {
  const [form,setForm]=useState({name:'',email:'',branch_id:'',designation:''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  function change(e){setForm(current=>({...current,[e.target.name]:e.target.value}));}
  async function submit(e){
    e.preventDefault();if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {onAdded(await addFaculty(form));onClose();}
    catch(e){setError(e.message);setBusy(false);pending.current=false;}
  }
  return <Dialog title="Add faculty" onClose={onClose} busy={busy}><form className="college-form" onSubmit={submit}>
    <label htmlFor="faculty-name">Full name</label><input id="faculty-name" name="name" value={form.name} onChange={change} maxLength={100} required disabled={busy}/>
    <label htmlFor="faculty-email">Email address</label><input id="faculty-email" name="email" type="email" value={form.email} onChange={change} maxLength={254} required disabled={busy}/>
    <label htmlFor="faculty-branch">Branch</label><select id="faculty-branch" name="branch_id" value={form.branch_id} onChange={change} required disabled={busy}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}</select>
    <label htmlFor="faculty-designation">Designation</label><input id="faculty-designation" name="designation" value={form.designation} onChange={change} placeholder="e.g. Assistant Professor" maxLength={100} required disabled={busy}/>
    <Notice error={error}/><div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" disabled={busy}>{busy?'Saving...':'Save faculty'}</button></div>
  </form></Dialog>;
}
export default function Faculty({branches,onBranches}) {
  const [list,setList]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[branchId,setBranchId]=useState(''),[modal,setModal]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');fetchFaculty().then(rows=>{if(active)setList(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
  const filtered=list.filter(f=>(!branchId||f.branch_id===branchId)&&`${f.name} ${f.email} ${f.designation} ${f.branches?.code||''}`.toLowerCase().includes(query.toLowerCase()));
  return <section><div className="college-title"><div><span className="eyebrow">PEOPLE & DEPARTMENTS</span><h1>Faculty</h1><p>College faculty directory</p></div><button className="btn-primary" onClick={()=>setModal(true)} disabled={!branches.length}><Plus size={18}/> Add faculty</button></div>
    <div className="faculty-toolbar"><label className="college-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search faculty" aria-label="Search faculty"/></label><label className="faculty-filter">Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)} aria-label="Filter faculty by branch"><option value="">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.code}</option>)}</select></label><span>{filtered.length} faculty</span></div>
    <Notice error={error}/>{error&&<button className="btn-secondary" onClick={()=>setRetry(r=>r+1)}>Retry faculty</button>}
    {loading?<Loading text="Loading faculty..."/>:!error&&(filtered.length?<div className="college-panel no-pad"><div className="table-scroll"><table className="faculty-table"><thead><tr><th>Faculty</th><th>Email</th><th>Branch</th><th>Designation</th></tr></thead><tbody>{filtered.map(f=><tr key={f.id}><td><span className="faculty-name"><span className="faculty-avatar"><Users size={18}/></span>{f.name}</span></td><td><a href={`mailto:${f.email}`}><Mail size={14}/>{f.email}</a></td><td><span className="status-pill">{f.branches?.code||branches.find(b=>b.id===f.branch_id)?.code}</span></td><td>{f.designation}</td></tr>)}</tbody></table></div></div>:<Empty title={list.length?'No matching faculty':'No faculty added yet'}>{!branches.length?<button className="btn-secondary" onClick={onBranches}>Add a branch first</button>:<p>{list.length?'Try another search or branch.':'Use Add faculty to create your directory.'}</p>}</Empty>)}
    {modal&&<FacultyForm branches={branches} onClose={()=>setModal(false)} onAdded={entry=>setList(rows=>[...rows,entry].sort((a,b)=>a.name.localeCompare(b.name)))}/>}
  </section>;
}
