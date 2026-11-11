import {createClient} from '@supabase/supabase-js';
export function createDatabase(config){
  if(!config.supabaseUrl||!config.supabaseKey)throw new Error('Set the Supabase URL and server secret in .env or server/.env.');
  return createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function query(request){const {data,error}=await request;if(error)throw error;return data;}
export const rpc=(db,name,args)=>query(db.rpc(name,args));
