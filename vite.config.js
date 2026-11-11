import {defineConfig,loadEnv} from 'vite';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const configured=(env.VITE_API_URL||'').trim();
  const target=new URL(/^https?:\/\//.test(configured)?configured:`http://127.0.0.1:${env.PORT||4000}`);
  if(target.hostname==='localhost')target.hostname='127.0.0.1';
  return {
    server:{proxy:{'/api':{
      target:target.toString().replace(/\/$/,''),changeOrigin:true,
      configure(proxy){
        proxy.on('error',(_error,_request,response)=>{
          if(!response.headersSent&&typeof response.writeHead==='function'){
            response.writeHead(503,{'Content-Type':'application/json'});
            response.end(JSON.stringify({error:'Calling server is unavailable. Start it with npm run server:dev, then retry.'}));
          }
        });
      }
    }}}
  };
});
