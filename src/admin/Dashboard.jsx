import React,{useEffect,useId,useRef,useState} from 'react';
import {Building2,GraduationCap,Users,ContactRound,MessageSquareText,Phone,RefreshCw,ArrowRight,History,Activity} from 'lucide-react';
import {fetchDashboard,fetchCollegeHistory} from '../supabaseData';
import {Notice,Loading} from './Ui';
import {DashboardMotion,AnimatedNumber,AnimatedBar,useDashboardProgress} from './DashboardMotion';

const number=value=>Number(value||0).toLocaleString('en-IN');
const shortDate=value=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(new Date(`${value}T00:00:00+05:30`));
const when=value=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date(value));
function ChartEmpty({children='No records yet.'}){return <div className="chart-empty"><Activity size={24}/><span>{children}</span></div>;}

function ActivityChart({points}) {
  const progress=useDashboardProgress();
  const gradient=useId().replace(/:/g,'');
  const [hovered,setHovered]=useState(null);
  const max=Math.max(1,...points.map(p=>p.count));
  const total=points.reduce((sum,p)=>sum+Number(p.count),0);
  const x=i=>42+i*(670/Math.max(1,points.length-1));
  const y=count=>172-Number(count)/max*140;
  const line=points.map((p,i)=>`${x(i)},${y(p.count)}`).join(' ');
  return <><div className="activity-readout"><b><AnimatedNumber value={hovered===null?total:points[hovered].count}/></b><span>{hovered===null?'saved activities':shortDate(points[hovered].date)}</span></div>{total?<svg className="activity-chart" viewBox="0 0 740 215" role="img" aria-label={`${number(total)} saved activities during the selected period`} tabIndex={0} onMouseLeave={()=>setHovered(null)} onBlur={()=>setHovered(null)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setHovered(i=>Math.max(0,Math.min(points.length-1,(i??0)+(e.key==='ArrowRight'?1:-1))));}}}>
    <defs><linearGradient id={`${gradient}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity=".32"/><stop offset="100%" stopColor="#38bdf8" stopOpacity=".03"/></linearGradient><linearGradient id={`${gradient}-line`}><stop stopColor="#0891b2"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
    {[0,1,2].map(i=>{const value=Math.round(max*i/2);return <g key={i}><line x1="42" x2="712" y1={y(value)} y2={y(value)} stroke="#e6edf4"/><text x="30" y={y(value)+4} textAnchor="end">{value}</text></g>;})}
    <g transform={`translate(0 ${172*(1-progress)}) scale(1 ${progress})`}><polygon points={`42,172 ${line} 712,172`} fill={`url(#${gradient}-area)`}/>
    <polyline points={line} fill="none" stroke={`url(#${gradient}-line)`} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map((p,i)=><circle key={p.date} cx={x(i)} cy={y(p.count)} r={hovered===i?6:3} fill={hovered===i?'#7c3aed':'#2563eb'}><title>{shortDate(p.date)}: {p.count} activities</title></circle>)}
    </g>{hovered!==null&&<line x1={x(hovered)} x2={x(hovered)} y1="24" y2="172" stroke="#a5b4fc" strokeDasharray="4 4"/>}{points.map((p,i)=><rect key={p.date} x={x(i)-335/Math.max(1,points.length-1)} y="20" width={670/Math.max(1,points.length-1)} height="155" fill="transparent" onMouseEnter={()=>setHovered(i)}><title>{shortDate(p.date)}: {p.count} activities</title></rect>)}
    {[0,Math.floor((points.length-1)/2),points.length-1].map((i,j)=><text key={j} x={x(i)} y="202" textAnchor={j===0?'start':j===2?'end':'middle'}>{shortDate(points[i].date)}</text>)}
  </svg>:<ChartEmpty>No activity in this period.</ChartEmpty>}
  <details className="chart-data"><summary>View daily totals</summary><div className="chart-table-scroll"><table><thead><tr><th>Date</th><th>Saved activity</th></tr></thead><tbody>{points.map(p=><tr key={p.date}><td>{shortDate(p.date)}</td><td>{number(p.count)}</td></tr>)}</tbody></table></div></details></>;
}
function Breakdown({items,donut=false}) {
  const progress=useDashboardProgress();
  const total=items.reduce((sum,item)=>sum+Number(item.value),0);
  let cursor=0;
  const stops=items.map(item=>{const start=cursor;cursor+=total?Number(item.value)/total*100*progress:0;return `${item.color} ${start}% ${cursor}%`;}).join(',');
  return <div className={`breakdown ${donut?'with-donut':''}`}>
    {donut&&<div className="chart-donut" style={{background:total?`conic-gradient(${stops}, #edf1f5 ${cursor}% 100%)`:'#edf1f5'}} role="img" aria-label={items.map(i=>`${i.label}: ${number(i.value)}`).join(', ')}><div><b><AnimatedNumber value={total}/></b><small>Total feedback</small></div></div>}
    <div className="breakdown-list">{items.map(item=><div className="breakdown-item" key={item.label}><div><span><i style={{background:item.color}}/>{item.label}</span><b><AnimatedNumber value={item.value}/></b></div>{!donut&&<div className="chart-track"><AnimatedBar percent={total?Number(item.value)/total*100:0} color={item.color}/></div>}</div>)}</div>
  </div>;
}
function OverallHistory({revision,onSection}) {
  const [items,setItems]=useState([]),[page,setPage]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{const token=++generation.current;setBusy(true);setError('');setItems([]);setPage(0);setMore(false);
    fetchCollegeHistory(0).then(data=>{if(token===generation.current){setItems(data.items);setMore(data.hasMore);}}).catch(e=>{if(token===generation.current)setError(e.message);}).finally(()=>{if(token===generation.current)setBusy(false);});return()=>{generation.current++;};
  },[revision]);
  async function load(){const token=generation.current;setBusy(true);setError('');try{const data=await fetchCollegeHistory(page+1);if(token===generation.current){setItems(old=>[...old,...data.items.filter(i=>!old.some(o=>o.id===i.id))]);setPage(p=>p+1);setMore(data.hasMore);}}catch(e){if(token===generation.current)setError(e.message);}finally{if(token===generation.current)setBusy(false);}}
  return <section className="college-panel dashboard-history"><div className="panel-heading-row"><h2><History size={19}/> College history</h2><span className="chart-caption">All branches / all time</span></div><Notice error={error}/>{busy&&!items.length?<Loading text="Loading history..."/>:!error&&!items.length?<ChartEmpty>Saved section activity will appear here.</ChartEmpty>:null}
    <div className="college-history-list">{items.map(item=><div className="college-history-row" key={item.id}><span className={`history-dot ${item.kind}`}/><div><b>{item.description}</b>{item.sections&&<button className="text-button" onClick={()=>onSection(item.sections)}>{item.sections.branches?.code} / {item.sections.year} / Section {item.sections.name}<ArrowRight size={13}/></button>}</div><time dateTime={item.created_at}>{when(item.created_at)}</time></div>)}</div>
    {more&&<button className="btn-secondary" onClick={load} disabled={busy}>{busy?'Loading...':'Load older history'}</button>}
  </section>;
}
export default function Dashboard({onBranches,onFaculty,onBranch,onSection}) {
  const [data,setData]=useState(null),[days,setDays]=useState(30),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setBusy(true);setError('');fetchDashboard(days).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[days,revision]);
  const metrics=[['students','Students',Users,onBranches],['branches','Branches',Building2,onBranches],['sections','Sections',GraduationCap,onBranches],['faculty','Faculty',ContactRound,onFaculty],['campaigns','Prepared setups',Phone,onBranches],['openFeedback','Open feedback',MessageSquareText,onBranches]];
  const maxBranch=Math.max(1,...(data?.branches||[]).map(b=>Number(b.students)));
  return <section className="animated-dashboard"><div className="college-title"><div><span className="eyebrow">COLLEGE OVERVIEW</span><h1>College dashboard</h1><p>Attendance, feedback, and activity across every branch.</p></div><div className="inline-actions"><button className="btn-secondary" disabled={busy} onClick={()=>setRevision(r=>r+1)}><RefreshCw size={16}/> Refresh</button><button className="btn-primary" onClick={onBranches}>View branches <ArrowRight size={16}/></button></div></div>
    <Notice error={error}/>{error&&<button className="btn-secondary" onClick={()=>setRevision(r=>r+1)}>Retry dashboard</button>}
    {busy?<Loading text="Loading dashboard..."/>:!error&&data&&<DashboardMotion>
      <div className="dashboard-metrics">{metrics.map(([key,label,Icon,action],index)=><button key={key} className={`metric-card metric-${key}`} style={{'--card-order':index}} onClick={action}><span className={`metric-icon ${key}`}><Icon size={21}/></span><small>{label}</small><b><AnimatedNumber value={data.totals[key]}/></b><span className="metric-foot">All time <ArrowRight size={14}/></span></button>)}</div>
      <div className="dashboard-chart-grid"><section className="college-panel activity-panel"><div className="panel-heading-row"><div><h2>Activity overview</h2><p className="chart-caption">Saved section changes</p></div><label className="period-filter"><span className="sr-only">Chart period</span><select aria-label="Chart period" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div><ActivityChart points={data.activity}/></section>
      <section className="college-panel"><div className="panel-heading-row"><div><h2>Feedback status</h2><p className="chart-caption">All recorded concerns</p></div><MessageSquareText size={20}/></div><Breakdown donut items={[{label:'Pending',value:data.feedback.pending,color:'#d39839'},{label:'Reviewed',value:data.feedback.reviewed,color:'#7581b5'},{label:'Resolved',value:data.feedback.resolved,color:'#3b9674'}]}/></section>
      <section className="college-panel"><div className="panel-heading-row"><div><h2>Attendance</h2><p className="chart-caption">Marked student-days / last {days} days</p></div><GraduationCap size={21}/></div><Breakdown items={[{label:'Present',value:data.attendance.present,color:'#438f77'},{label:'Absent',value:data.attendance.absent,color:'#c6696e'},{label:'Late',value:data.attendance.late,color:'#d39839'}]}/>{!Object.values(data.attendance).some(Number)&&<p className="chart-caption">No attendance marked in this period.</p>}</section>
      <section className="college-panel"><div className="panel-heading-row"><div><h2>Calling preparation</h2><p className="chart-caption">Saved setups / all time</p></div><span className="status-pill">Prepared</span></div><Breakdown items={[{label:'Mentoring & attendance',value:data.campaigns.mentoring,color:'#1765a1'},{label:'Feedback',value:data.campaigns.feedback,color:'#8a70a9'}]}/><div className="calling-status"><Phone size={16}/><span>Open a section to manage calls.</span></div></section>
      <section className="college-panel branch-chart-panel"><div className="panel-heading-row"><div><h2>Branch overview</h2><p className="chart-caption">Students, sections, and faculty</p></div><button className="text-button" onClick={onBranches}>View branches <ArrowRight size={15}/></button></div>{data.branches.length?<div className="branch-bars">{data.branches.map((b,index)=><button key={b.id} className="branch-bar-row" style={{'--branch-color':['#2563eb','#8b5cf6','#0d9488','#e08b27','#db5687'][index%5]}} onClick={()=>onBranch(b)} aria-label={`Open ${b.code}: ${b.students} students, ${b.sections} sections, ${b.faculty} faculty`}><span><b>{b.code}</b><small><AnimatedNumber value={b.sections}/> sections / <AnimatedNumber value={b.faculty}/> faculty</small></span><div className="chart-track"><AnimatedBar percent={Number(b.students)/maxBranch*100} color="var(--branch-color)"/></div><strong><AnimatedNumber value={b.students}/><small>students</small></strong><ArrowRight size={15}/></button>)}</div>:<ChartEmpty>Add a branch to start your college overview.</ChartEmpty>}</section>
      </div>
    </DashboardMotion>}
    <OverallHistory revision={revision} onSection={onSection}/>
  </section>;
}
