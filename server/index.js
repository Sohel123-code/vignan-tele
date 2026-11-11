import {readConfig} from './lib/config.js';
import {createDatabase} from './lib/supabase.js';
import {createWorker} from './lib/worker.js';
import {createApp} from './app.js';
const config=readConfig();
const db=createDatabase(config);
const worker=createWorker(db,config);
const app=createApp({db,config});
const server=app.listen(config.port,()=>{console.log(`Calling API listening on port ${config.port}`);worker.start();});
async function shutdown(){server.close();await worker.stop();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
