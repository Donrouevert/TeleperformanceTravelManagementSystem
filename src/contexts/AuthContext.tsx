import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, cloudMode } from '../lib/supabase';
import { demoUsers } from '../db/seed';
import { AuthScreen } from '../features/auth/AuthScreen';
import { LoginWelcome } from '../features/auth/LoginWelcome';
import { WorkspaceSkeleton } from '../components/Skeleton';
import { displayPerson } from '../lib/identity';
import type { User } from '../types/travel';
const AuthContext=createContext<{user:User;signOut:()=>Promise<void>;cloud:boolean}|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
 const [welcome,setWelcome]=useState(false);
 const finishWelcome=useCallback(()=>{setWelcome(false);requestAnimationFrame(()=>document.querySelector<HTMLElement>('main .module-transition')?.focus({preventScroll:true}));},[]);
 const query=useQueryClient(),[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(cloudMode),[error,setError]=useState(''),[recovering,setRecovering]=useState(location.pathname==='/auth/reset-password'),[recoveryReady,setRecoveryReady]=useState(false);
 useEffect(()=>{if(!supabase){const saved=sessionStorage.getItem('teleperformance-demo-account');setUser(demoUsers.find(u=>u.employeeId===saved)??null);return;}
 let active=true,revision=0,sessionIdentity:string|null=null;
 const load=async(id?:string)=>{if(!active||sessionIdentity===(id??''))return;sessionIdentity=id??'';const version=++revision;setLoading(true);setUser(null);query.clear();setError('');if(!id){if(active){setLoading(false);setWelcome(false);}return;}
 try{const {data:p,error:e}=await supabase!.from('profiles').select('*').eq('id',id).single();if(!active||version!==revision)return;
 if(e||!p){sessionIdentity=null;setWelcome(false);setError('This account needs a provisioned employee profile and role. Contact your administrator.');setLoading(false);return;}
 const {data:m}=p.approving_manager_id?await supabase!.from('profiles').select('employee_name,employee_id').eq('id',p.approving_manager_id).single():{data:null};if(!active||version!==revision)return;
 setUser({authId:id,employeeId:p.employee_id,employeeName:p.employee_name,role:p.role,departmentFunction:p.department_function,position:p.position,emailAddress:p.email_address,contactNumber:p.contact_number,costCenterProjectCode:p.cost_center_project_code,approvingManagerId:m?.employee_id??'',approvingManagerName:m?.employee_name??''});setLoading(false);}catch{if(active&&version===revision){sessionIdentity=null;setWelcome(false);setLoading(false);setError("Unable to open your account. Please try again.");}}};
 void supabase.auth.getSession().then(({data})=>{if(location.pathname==='/auth/reset-password'){setRecovering(true);setRecoveryReady(Boolean(data.session));setLoading(false);}else void load(data.session?.user.id);}).catch(()=>{if(active){setLoading(false);setError('Unable to open your account. Please try again.');}});const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>{if(_e==='PASSWORD_RECOVERY'||location.pathname==='/auth/reset-password'){setRecovering(true);setRecoveryReady(Boolean(s));setLoading(false);return;}if(_e==='TOKEN_REFRESHED')return;setTimeout(()=>void load(s?.user.id),0);});return()=>{active=false;l.subscription.unsubscribe();};},[query]);
 const signOut=async()=>{setWelcome(false);if(supabase)await supabase.auth.signOut();sessionStorage.removeItem('teleperformance-demo-account');history.replaceState(null,'','/dashboard');setUser(null);query.clear();};
 let content:ReactNode;
 if(loading)content=welcome?null:<WorkspaceSkeleton/>;
 else if(recovering)content=<AuthScreen key="recovery" recovery recoveryReady={recoveryReady} onDemo={()=>{}} onRecoveryExit={async()=>{await signOut();setRecovering(false);setRecoveryReady(false);history.replaceState(null,'','/dashboard');}}/>;
 else if(!user)content=<AuthScreen key="login" error={error} onSignedIn={()=>setWelcome(true)} onDemo={u=>{history.replaceState(null,'','/dashboard');query.clear();sessionStorage.setItem('teleperformance-demo-account',u.employeeId);setWelcome(true);setUser(u);}}/>;
 else content=<AuthContext.Provider value={{user:displayPerson(user),signOut,cloud:cloudMode}}>{children}</AuthContext.Provider>;
 return <><div inert={welcome} aria-hidden={welcome||undefined}>{content}</div>{welcome&&<LoginWelcome ready={!loading&&!!user} onComplete={finishWelcome}/>}</>;

}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error('AuthProvider missing');return v;}
