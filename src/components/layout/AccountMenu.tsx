import {useState} from 'react';
import {Popover} from '@base-ui/react/popover';
import {Building2,ChevronDown,BriefcaseBusiness,LogOut,ShieldCheck,LoaderCircle} from 'lucide-react';
import {displayName} from '../../lib/identity';
import type {User} from '../../types/travel';
import './account-menu.css';
const roleNames={REQUESTOR:'Travel requestor',ADMIN:'Travel administrator',MANAGER:'Approving manager',TMC:'Travel consultant'};
const provided=(value:string|undefined)=>Boolean(value?.trim()&&!/^(not provided|not set|n\/?a)$/i.test(value.trim()));
export function AccountMenu({user,cloud,onSignOut}:{user:User;cloud:boolean;onSignOut:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const name=displayName(user.employeeName).trim()||'Your account';
 const initials=name.split(/[\s._-]+/).filter(Boolean).slice(0,2).map(part=>Array.from(part)[0]).join('').toUpperCase();
 const role=roleNames[user.role];
 const signOut=async()=>{if(busy)return;setBusy(true);setError('');try{await onSignOut();}catch{setError('We couldn’t sign you out. Please try again.');}finally{setBusy(false);}};
 return <Popover.Root><Popover.Trigger className="account-trigger account-menu-trigger" aria-label={'Account menu for '+name}>
  <span className="account-menu-avatar" aria-hidden="true">{initials}</span><span className="account-menu-trigger-copy"><b>{name}</b><small>{role}</small></span><ChevronDown className="account-menu-chevron" size={14}/>
 </Popover.Trigger><Popover.Portal><Popover.Positioner side="bottom" sideOffset={10} align="end" collisionPadding={12} className="account-menu-positioner"><Popover.Popup className="account-menu-popup">
  <div className="account-menu-heading"><Popover.Title>My account</Popover.Title><span>{cloud?'Workspace account':'Demo account'}</span></div>
  <Popover.Description className="sr-only">Signed-in details for {name}.</Popover.Description>
  <div className="account-menu-identity"><span className="account-menu-avatar account-menu-avatar-large" aria-hidden="true">{initials}</span><div><strong>{name}</strong><span className="account-menu-role">{user.role}</span><p>Teleperformance</p></div></div>
  <dl className="account-menu-details"><div><dt><ShieldCheck size={15}/>Access</dt><dd>{role}</dd></div>
   {provided(user.departmentFunction)&&<div><dt><Building2 size={15}/>Department</dt><dd>{user.departmentFunction}</dd></div>}
   {provided(user.position)&&user.position.trim().toLowerCase()!==role.toLowerCase()&&<div><dt><BriefcaseBusiness size={15}/>Position</dt><dd>{user.position}</dd></div>}
  </dl>
  <div className="account-menu-footer">{error&&<p className="account-menu-error" role="alert">{error}</p>}<button type="button" className="account-menu-signout" onClick={()=>void signOut()} disabled={busy} aria-busy={busy}>{busy?<LoaderCircle className="account-menu-spinner" size={17}/>:<LogOut size={17}/>}<span>{busy?'Signing out…':'Sign out'}</span></button></div>
 </Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>;
}
