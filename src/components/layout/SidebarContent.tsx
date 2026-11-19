import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, ClipboardList, LayoutDashboard, Leaf, Plane, ShieldCheck, Wallet } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { preloadModule } from '../../lib/modules';

import type { User } from '../../types/travel';

const links=[{to:'/dashboard',label:'Overview',icon:LayoutDashboard},{to:'/flights/search',label:'Find a flight',icon:Plane},{to:'/bookings',label:'Travel requests',icon:ClipboardList},{to:'/admin/flights',label:'Flight operations',icon:CalendarDays},{to:'/payments',label:'Payments & billing',icon:Wallet}];
export function SidebarContent({user,compact=false,pending,onNavigate}:{user:User;compact?:boolean;pending:number;onNavigate:()=>void}) {
 // Keep tooltip ownership above individual links so collapse cannot reveal stale portals.
 const {pathname}=useLocation();
 const [tooltip,setTooltip]=useState<string|null>(null);
 const hoverTimer=useRef<{route:string;timer:ReturnType<typeof setTimeout>}|null>(null);
 const dismiss=useCallback((route?:string)=>{
   if(hoverTimer.current&&(!route||hoverTimer.current.route===route)){clearTimeout(hoverTimer.current.timer);hoverTimer.current=null;}
   setTooltip(current=>!route||current===route?null:current);
 },[]);
 useEffect(()=>{dismiss();return()=>{if(hoverTimer.current){clearTimeout(hoverTimer.current.timer);hoverTimer.current=null;}};},[compact,pathname,dismiss]);
 const showOnHover=(route:string)=>{
   if(!compact)return;
   dismiss();
   hoverTimer.current={route,timer:setTimeout(()=>{hoverTimer.current=null;setTooltip(route);},200)};
 };
 return <><Link className="brand tp-workspace-brand" to="/dashboard" aria-label="Teleperformance home" onClick={onNavigate}><span className="brand-symbol tp-rail-monogram" aria-hidden="true">TP</span><div className="sidebar-label brand-copy" aria-hidden={compact}><b>Travel workspace</b><small>{user.role === "REQUESTOR" ? "Employee" : user.role === "ADMIN" ? "Administration" : user.role === "MANAGER" ? "Management" : "Travel desk"}</small></div></Link>
  <div className="workspace-label sidebar-label" aria-hidden={compact}>YOUR WORKSPACE</div>
  <nav aria-label="Workspace navigation">{links.filter(link=>!['/payments','/admin/flights'].includes(link.to)||user.role==='TMC').map(link=>({...link,label:link.to==='/bookings'?{REQUESTOR:'My requests',ADMIN:'Request administration',MANAGER:'Team approvals',TMC:'Travel records'}[user.role]:link.label})).map(({to,label,icon:Icon})=><Tooltip.Root key={to} open={compact&&tooltip===to} onOpenChange={open=>{if(!open)dismiss(to);}} disableHoverableContent><Tooltip.Trigger asChild><NavLink to={to} end={to==='/bookings'} aria-label={label} onPointerEnter={event=>{preloadModule(to);if(event.pointerType!=='touch')showOnHover(to);}} onPointerLeave={()=>dismiss(to)} onPointerDown={()=>dismiss()} onFocus={event=>{preloadModule(to);if(compact&&event.currentTarget.matches(':focus-visible')){dismiss();setTooltip(to);}}} onBlur={()=>dismiss(to)} onTouchStart={()=>{preloadModule(to);dismiss();}} onClick={()=>{dismiss();onNavigate();}} className="transition-colors duration-200"><Icon size={19}/><span className="sidebar-label" aria-hidden={compact}>{label}</span>{to==='/bookings'&&pending>0&&<i className="sidebar-label" aria-hidden={compact}>{pending}</i>}</NavLink></Tooltip.Trigger>{compact&&tooltip===to&&<Tooltip.Portal><Tooltip.Content className="tooltip sidebar-tooltip" side="right" sideOffset={14}>{label}<Tooltip.Arrow/></Tooltip.Content></Tooltip.Portal>}</Tooltip.Root>)}</nav>
  <div className="sidebar-bottom"><div className="sidebar-card-wrap" inert={compact} aria-hidden={compact}><div className="sustainability-note"><Leaf size={23}/><b>Every journey.<br/>A human connection.</b><p>Plan thoughtfully. Choose a<br/>lower-impact flight when you can.</p><Link to="/flights/search?eco=true" onClick={onNavigate}>Explore Eco-Choice <ArrowUpRight size={14}/></Link></div></div><div className="sidebar-profile"><div className="avatar">{user.employeeName.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="sidebar-label" aria-hidden={compact}><b title={user.employeeName}>{user.employeeName}</b><small>{user.departmentFunction}</small></div><ShieldCheck className="sidebar-profile-shield" size={17}/></div></div></>;
}
