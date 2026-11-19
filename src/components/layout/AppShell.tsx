import { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ChevronsLeft, Plus, Bell, Menu, Leaf, X } from 'lucide-react';
import { Dialog } from '@base-ui/react/dialog';
import { Popover } from '@base-ui/react/popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useEvents, useRequests } from '../../hooks/useTravel';
import { ModuleTransition } from './ModuleTransition';
import { preloadModule } from '../../lib/modules';
import { BrandWordmark } from './BrandWordmark';
import { ThemeToggle } from '../ThemeToggle';
import {AccountMenu} from './AccountMenu';
import { SidebarContent } from './SidebarContent';
export function AppShell() {
  const { user, signOut, cloud } = useAuth(), socket = useSocket();
  const { data: events = [] } = useEvents(), { data: requests = [] } = useRequests();
  const [collapsed, setCollapsed] = useState(()=>window.innerWidth<1024), [mobileOpen, setMobileOpen] = useState(false);
  const [desktop,setDesktop]=useState(()=>window.innerWidth>=768);
  useEffect(()=>{const media=window.matchMedia('(min-width: 768px)');const change=()=>{setDesktop(media.matches);if(media.matches)setMobileOpen(false);};change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const hideHeaderBrand=false;
  const pending = requests.filter(r => user.role==='REQUESTOR'?r.status==='CHANGES_REQUESTED':user.role==='ADMIN'?r.status==='PENDING_ADMIN':user.role==='MANAGER'?r.status==='PENDING_APPROVAL':['APPROVED_FOR_TMC','REBOOKING_REQUESTED'].includes(r.status)).length;
  return <Tooltip.Provider delayDuration={200}><div className={`app ${collapsed ? 'is-collapsed' : ''}`}><aside id="workspace-sidebar" className="sidebar transition-[width] duration-300 ease-in-out" aria-label="Primary sidebar" aria-hidden={!desktop} inert={!desktop}><SidebarContent user={user} compact={collapsed} pending={pending} onNavigate={()=>{}}/><button className="collapse-btn icon-btn transition-transform duration-300 hover:scale-105 active:scale-95" aria-expanded={!collapsed} aria-controls="workspace-sidebar" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}><ChevronsLeft size={18}/></button></aside><div className="app-body"><header className="topbar"><div className="topbar-left"><Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Trigger className="icon-btn mobile-menu" aria-label="Open navigation"><Menu size={21}/></Dialog.Trigger><Dialog.Portal><Dialog.Backdrop className="modal-backdrop drawer-backdrop"/><Dialog.Popup className="mobile-sidebar"><Dialog.Title className="sr-only">Navigation</Dialog.Title><Dialog.Close className="icon-btn drawer-close" aria-label="Close navigation"><X size={20}/></Dialog.Close><SidebarContent user={user} pending={pending} onNavigate={()=>setMobileOpen(false)}/></Dialog.Popup></Dialog.Portal></Dialog.Root><Link onPointerEnter={()=>preloadModule('/dashboard')} onFocus={()=>preloadModule('/dashboard')} className={"header-brand "+(hideHeaderBrand?"is-brand-hidden":"")} aria-hidden={hideHeaderBrand} tabIndex={hideHeaderBrand?-1:0} to="/dashboard" aria-label="Teleperformance home"><BrandWordmark/></Link></div><div className="topbar-actions"><span className="sync"><i className={socket.connected ? 'online' : ''}/>{socket.mode}</span><AccountMenu user={user} cloud={cloud} onSignOut={signOut}/><ThemeToggle/><Popover.Root><Popover.Trigger className="icon-btn notification-trigger" aria-label="Notifications"><Bell size={19}/>{events.length > 0 && <i/>}</Popover.Trigger><Popover.Portal><Popover.Positioner sideOffset={12} align="end"><Popover.Popup className="notification-popup"><Popover.Title>Activity feed</Popover.Title><p>Updates across your travel workspace</p>{events.map(event => <Link to={event.requestId ? `/bookings/${event.requestId}` : '/dashboard'} key={event.id}><span className="activity-dot"/><div>{event.message}<small>{new Date(event.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div></Link>)}</Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>{user.role==="REQUESTOR"&&<Link onPointerEnter={()=>preloadModule('/bookings/new')} onFocus={()=>preloadModule('/bookings/new')} to="/bookings/new" className="btn btn-primary topbar-cta" aria-label="New travel request"><Plus size={16}/><span className="cta-label">New request</span></Link>}</div></header><main><ModuleTransition><Outlet/></ModuleTransition></main><footer><span>© {new Date().getFullYear()} Teleperformance · Corporate Travel</span><span><Leaf size={13}/> Safe travels. Sustainable choices. Greater impact.</span><span className="demo-label">{cloud?"Connected workspace":"Demo workspace"}</span></footer></div></div></Tooltip.Provider>;
}
