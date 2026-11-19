import {createClient} from 'npm:@supabase/supabase-js@2';
import {createAviationHandler} from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const key=Deno.env.get('AVIATIONSTACK_API_KEY')?.trim();
const origins=(Deno.env.get('APP_ALLOWED_ORIGINS')||'https://teleperformance-travel.vercel.app,http://localhost:5173,http://127.0.0.1:5173').split(',').map(value=>value.trim().replace(/\/$/,'')).filter(Boolean);
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createAviationHandler({
 origins,keyConfigured:!!key,now:Date.now,
 authenticate:async authorization=>{
  const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser();if(error||!user)return null;
  const {data:profile}=await auth.from('profiles').select('id').eq('id',user.id).single();return profile?user.id:null;
 },
 reserve:async(code,user)=>{const {data,error}=await admin.rpc('reserve_aviation_lookup',{p_code:code,p_user:user});if(error)throw error;return data;},
 provider:async code=>{
  const endpoint=new URL('https://api.aviationstack.com/v1/flights');endpoint.searchParams.set('access_key',key!);endpoint.searchParams.set('flight_iata',code);endpoint.searchParams.set('limit','100');
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000)});return {ok:response.ok,body:await response.json()};
 },
 cache:async(code,payload,expires_at)=>{const {error}=await admin.from('aviation_cache').upsert({code,payload,expires_at});if(error)throw new Error('Cache write failed');},
 release:async code=>{const {error}=await admin.from('aviation_inflight').delete().eq('code',code);if(error)throw error;},
}));
