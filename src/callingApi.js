import {supabase} from './auth';
const configuredUrl=(import.meta.env.VITE_API_URL||'').trim();
// Vite forwards local /api requests to the backend. Production keeps its
// explicitly configured HTTPS backend (or / for single-host deployments).
const base=import.meta.env.DEV?'':configuredUrl.replace(/\/$/,'');
export const callingApiConfigured=import.meta.env.DEV||Boolean(configuredUrl);
export async function callingRequest(path,{method='GET',body,signal,blob=false}={}){
  if(!callingApiConfigured)throw new Error('Set VITE_API_URL to your calling backend URL and rebuild the frontend.');
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw new Error('Sign in again to continue.');
  const form=body instanceof FormData;
  let response;
  try{response=await fetch(base+'/api'+path,{method,signal,headers:{Authorization:`Bearer ${data.session.access_token}`,...(body&&!form?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined});}
  catch(e){if(e.name==='AbortError')throw e;throw new Error('Cannot reach the calling backend. Check its URL and that the server is running.');}
  if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||`Request failed (${response.status}).`);}
  return blob?response.blob():response.json();
}
export function saveBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
