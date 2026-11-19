import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const {projectRef,name}=JSON.parse(fs.readFileSync('supabase/project.json','utf8'));
if(name!=='TeleperformanceTravelManagementSystem'||projectRef!=='pfylcerdvtajgeoxlxvi')throw new Error('Teleperformance project guard failed.');
const origin='https://teleperformance-travel-management.solefolio16.chatgpt.site';
const token=process.env.SUPABASE_ACCESS_TOKEN||fs.readFileSync('C:/Users/donro/.supabase/access-token','utf8').trim();
const headers={Authorization:'Bearer '+token};
const base=`https://api.supabase.com/v1/projects/${projectRef}`;
async function call(route,method='GET',body){const result=await fetch(base+route,{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await result.text();if(!result.ok)throw new Error(`${route}: ${result.status} ${text.replaceAll(token,'[redacted]')}`);return text?JSON.parse(text):null;}
await call('/config/auth','PATCH',{site_url:origin,uri_allow_list:`${origin}/auth/reset-password,http://127.0.0.1:5180/auth/reset-password,http://localhost:5173/auth/reset-password,http://127.0.0.1:5173/auth/reset-password`,disable_signup:true});
await call('/secrets','POST',[{name:'APP_ALLOWED_ORIGINS',value:`${origin},http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5180`}]);
const form=new FormData();
form.append('metadata',JSON.stringify({name:'aviationstack',entrypoint_path:'aviationstack/index.ts',verify_jwt:true}));
for(const file of ['aviationstack/index.ts','aviationstack/handler.ts','_shared/aviation.ts'])form.append('file',new File([fs.readFileSync('supabase/functions/'+file)],file,{type:'application/typescript'}));
const deployment=await fetch(base+'/functions/deploy?slug=aviationstack',{method:'POST',headers,body:form});
const result=await deployment.json();if(!deployment.ok)throw new Error('Function deployment: '+deployment.status+' '+JSON.stringify(result));
const keys=await call('/api-keys');const key=keys.find(item=>item.name==='service_role')?.api_key;
const admin=createClient(`https://${projectRef}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:existing,error}=await admin.from('flight_schedules').select('id').eq('flight_number','DEMO01A');if(error)throw error;
if(!existing.length){
 const {data:source,error:failure}=await admin.from('flight_schedules').select('*,flight_cabins(*)').eq('origin','MNL').limit(2);if(failure)throw failure;
 for(const [index,flight]of source.entries()){
  const id=crypto.randomUUID();const {flight_cabins,...row}=flight;
  const inserted=await admin.from('flight_schedules').insert({...row,id,flight_number:`DEMO0${index+1}A`});if(inserted.error)throw inserted.error;
  const cabins=await admin.from('flight_cabins').insert(flight_cabins.map(cabin=>({...cabin,flight_id:id})));if(cabins.error)throw cabins.error;
 }
}
const verified=await call('/config/auth');
fs.writeFileSync('supabase/deployment.json',JSON.stringify({projectRef,origin,edgeFunction:{slug:result.slug,status:result.status,version:result.version},liveProviderKeyConfigured:false,demoFlightCodes:['DEMO01A','DEMO02A']},null,2)+'\n');
console.log(JSON.stringify({projectRef,siteUrl:verified.site_url,edgeFunction:result.slug,status:result.status,liveProviderKeyConfigured:false,demoStatusSchedules:2}));
