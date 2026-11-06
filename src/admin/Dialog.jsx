import React, {useEffect, useRef} from 'react';
import {X} from 'lucide-react';

export default function Dialog({title,children,onClose,busy=false,className=''}) {
  const ref=useRef(null);const latest=useRef({onClose,busy});latest.current={onClose,busy};
  useEffect(()=>{
    const previous=document.activeElement;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const controls=()=>[...ref.current.querySelectorAll('button,input,select,textarea,a[href]')]
      .filter(element=>!element.matches(':disabled')&&element.tabIndex>=0)
      .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    (ref.current.querySelector('input')||controls()[0]||ref.current).focus();
    function keyboard(e){
      if(e.key==='Escape'&&!latest.current.busy){e.preventDefault();latest.current.onClose();}
      if(e.key==='Tab'){
        const items=controls(),first=items[0],last=items.at(-1);
        if(!first){e.preventDefault();return;}
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',keyboard,true);
    return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keyboard,true);previous?.focus();};
  },[]);
  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal-box ${className}`}><div className="modal-header"><h2>{title}</h2><button className="icon-button" disabled={busy} aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</section></div>;
}
