export function normalizePhone(raw){
  if(raw==null||raw==='')return null;
  let phone=String(raw).trim().replace(/[\s().-]/g,'');
  if(/^\d{10}$/.test(phone))phone='+91'+phone;
  else if(/^91\d{10}$/.test(phone))phone='+'+phone;
  else if(/^0\d{10}$/.test(phone))phone='+91'+phone.slice(1);
  return /^\+[1-9]\d{9,14}$/.test(phone)?phone:null;
}
