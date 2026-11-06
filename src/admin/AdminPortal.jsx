import React, {useEffect, useState} from 'react';
import {ArrowLeft, ArrowUpRight, ArrowRight, LockKeyhole, Mail, Eye, EyeOff, LoaderCircle, ShieldCheck, LogOut, AlertCircle} from 'lucide-react';
import {Logo} from '../Brand';
import {supabase, isAdmin} from '../auth';
import Workspace from './Workspace';
import './admin.css';
import './dashboard.css';

function focusField(event) {
  if (!event.target.closest('button')) event.currentTarget.querySelector('input')?.focus();
}

export function Login({client=supabase, initialError=''}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(initialError);
  async function submit(e) {
    e.preventDefault();
    if (!client || busy) return;
    setBusy(true);setError('');
    try {
      const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
      if(error) setError(error.code==='invalid_credentials'?'Email or password is incorrect.':error.message);
    } catch {setError('Unable to connect. Please try again.');}
    finally {setBusy(false);}
  }
  return <main className="login-page"><div className="login-art"><Logo/><div className="login-story"><span className="eyebrow">VIIT · ADMIN WORKSPACE</span><h1>A closer<br/>campus starts<br/>with you.</h1><div className="login-flow"><span><i>01</i> Choose your class</span><span><i>02</i> Prepare your campaign</span><span><i>03</i> Keep it all in view</span></div></div><span className="login-art-footer">Student updates. Meaningful connections.</span></div><div className="login-side"><a className="back-link" href="/"><ArrowLeft size={15}/> Back to home</a><div className="login-form-wrap"><span className="login-lock"><LockKeyhole size={26}/></span><span className="eyebrow">ADMIN PORTAL</span><h2>Welcome back.</h2><p>Sign in to your workspace.</p><form onSubmit={submit}><label htmlFor="admin-email">Email address</label><div className="login-input" onClick={focusField}><Mail size={17}/><input id="admin-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@college.edu" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></div><label htmlFor="admin-password">Password</label><div className="login-input" onClick={focusField}><LockKeyhole size={17}/><input id="admin-password" type={visible?'text':'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={visible?'Hide password':'Show password'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>{error&&<div className="inline-error" role="alert"><AlertCircle size={15}/>{error}</div>}{!client&&<div className="login-config" role="status">Admin sign-in is being configured.</div>}<button type="submit" className="button dark login-submit" disabled={!client||busy}>{busy?<><LoaderCircle className="spin" size={17}/> Signing in…</>:<>Sign in <ArrowRight size={17}/></>}</button></form><div className="login-security"><ShieldCheck size={14}/> Authorized administrators only</div></div><span className="login-bottom">VIIT AI Feedback <ArrowUpRight size={14}/></span></div></main>;
}

export default function AdminPortal() {
  const [session,setSession]=useState(undefined);
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(Boolean(supabase));
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!supabase){setSession(null);return;}
    let alive=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setUser(previous=>previous?.id===next?.user?.id?previous:null);setSession(next);}});
    supabase.auth.getSession().then(({data,error})=>{if(alive){if(error)setError('Please sign in again.');setSession(data?.session||null);}}).catch(()=>{if(alive){setError('Unable to restore your session. Please sign in again.');setSession(null);}});
    return()=>{alive=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(session===undefined)return;
    if(!session){setUser(null);setChecking(false);return;}
    let alive=true;
    setChecking(!user);
    supabase.auth.getUser().then(({data,error})=>{if(alive){setUser(error?null:data.user);if(error)setError('Your session could not be verified. Please sign in again.');setChecking(false);}}).catch(()=>{if(alive){setUser(null);setChecking(false);setError('Unable to verify your session. Please sign in again.');}});
    return()=>{alive=false;};
  },[session]);
  async function signOut(){
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(error)throw error;
    setUser(null);setSession(null);setError('');
  }
  if(checking) return <div className="auth-loading"><Logo/><LoaderCircle className="spin" size={24}/><span>Opening your workspace…</span></div>;
  if(!user) return <Login initialError={error}/>;
  if(!isAdmin(user)) return <div className="auth-loading"><Logo/><ShieldCheck size={40}/><h1>Admin access required</h1><p>This account hasn’t been assigned an admin role.</p>{error&&<p role="alert">{error}</p>}<button className="button dark" onClick={()=>signOut().catch(()=>setError('Unable to sign out. Please try again.'))}><LogOut size={16}/> Sign out</button></div>;
  return <Workspace key={user.id} user={user} onSignOut={signOut}/>;
}
