import * as XLSX from 'xlsx';
import {normalizePhone} from './phone.js';
export function parseContacts(buffer){
  let workbook;
  try{workbook=XLSX.read(buffer,{type:'buffer',sheetRows:202});}catch{throw Object.assign(new Error('Cannot read this Excel file.'),{status:400});}
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet)throw Object.assign(new Error('The workbook has no worksheet.'),{status:400});
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true});
  if(rows.length<2)throw Object.assign(new Error('Add a header and at least one contact.'),{status:400});
  if(rows.length>201)throw Object.assign(new Error('Maximum 200 rows per upload.'),{status:400});
  const headers=rows[0].map(h=>String(h).trim().toLowerCase());
  const phoneColumn=headers.findIndex(h=>['phone','mobile','number'].includes(h));
  if(phoneColumn<0)throw Object.assign(new Error('Add a phone, mobile or number column.'),{status:400});
  if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw Object.assign(new Error('Column names must be unique.'),{status:400});
  const good=[],rejected=[],seen=new Set();let duplicates=0;
  rows.slice(1).forEach((values,i)=>{
    if(values.every(v=>String(v).trim()===''))return;
    const phone=normalizePhone(values[phoneColumn]);
    if(!phone){rejected.push({row:i+2,reason:'Invalid phone number'});return;}
    if(seen.has(phone)){duplicates++;return;}seen.add(phone);
    const name=String(values[headers.indexOf('name')]||'').trim().slice(0,150);
    const extra=Object.fromEntries(headers.flatMap((h,k)=>h&&!['name','phone','mobile','number','__proto__','constructor','prototype'].includes(h)?[[h,String(values[k]??'').slice(0,2000)]]:[]));
    good.push({name:name||null,phone,extra});
  });
  return {good,rejected,duplicates};
}
export function sampleWorkbook(){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['name','phone'],['Your name','Replace with your consenting test number']]),'Contacts');return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});}
