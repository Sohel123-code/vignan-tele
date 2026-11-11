import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyOutperoSignature(body,timestamp,signature,secret,now=Date.now()){
  if(!secret||!Buffer.isBuffer(body)||!/^\d{10}$/.test(timestamp||'')||!/^sha256=[a-f0-9]{64}$/i.test(signature||''))return false;
  if(Math.abs(now/1000-Number(timestamp))>300)return false;
  const expected='sha256='+createHmac('sha256',secret).update(timestamp+'.').update(body).digest('hex');
  return timingSafeEqual(Buffer.from(expected),Buffer.from(signature.toLowerCase()));
}
