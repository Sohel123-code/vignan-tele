import React,{createContext,useContext,useEffect,useState} from 'react';

const MotionProgress=createContext(1);
export function DashboardMotion({children}) {
  const [progress,setProgress]=useState(0);
  useEffect(()=>{
    const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame,start;
    const finish=()=>{if(preference?.matches){cancelAnimationFrame(frame);setProgress(1);}};
    if(preference?.matches){setProgress(1);return;}
    function tick(now){
      start??=now;
      const elapsed=Math.min(1,(now-start)/1200);
      setProgress(1-Math.pow(1-elapsed,3));
      if(elapsed<1)frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    preference?.addEventListener?.('change',finish);
    return()=>{cancelAnimationFrame(frame);preference?.removeEventListener?.('change',finish);};
  },[]);
  return <MotionProgress.Provider value={progress}>{children}</MotionProgress.Provider>;
}
export const useDashboardProgress=()=>useContext(MotionProgress);
export function AnimatedNumber({value}) {
  const progress=useDashboardProgress();
  const total=Number(value)||0;
  return <span className="animated-number"><span aria-hidden="true">{Math.round(total*progress).toLocaleString('en-IN')}</span><span className="sr-only">{total.toLocaleString('en-IN')}</span></span>;
}
export function AnimatedBar({percent,color}) {
  const progress=useDashboardProgress();
  return <span style={{width:`${percent*progress}%`,background:color}}/>;
}
