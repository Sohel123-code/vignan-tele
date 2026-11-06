import React from 'react';
import {Building2,RefreshCw} from 'lucide-react';

export function Notice({error,message}) {
  return error||message?<div className={`college-notice ${error?'error':'success'}`} role={error?'alert':'status'}>{error||message}</div>:null;
}
export function Loading({text='Loading...'}) {return <div className="college-loading" role="status"><RefreshCw size={19} className="spin"/>{text}</div>;}
export function Empty({title,children}) {return <div className="college-empty"><Building2 size={28}/><h3>{title}</h3>{children}</div>;}
