import React, { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeToaster } from './components/ThemeToggle';
import { cancelReloadAnimation } from './lib/reloadAnimation';
import { initializeTheme } from './lib/theme';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { useAuth } from './contexts/AuthContext';
import { cloudMode } from './lib/supabase';
import {RoleGate} from './components/RoleGate';
import { WorkspaceSkeleton } from './components/Skeleton';
import { modules } from './lib/modules';
import { seedDatabase } from './db/seed';
import './index.css';
import './responsive.css';
import './sidebar-theme.css';
import './themes.css';
import './role-workflows.css';
import './teleperformance.css';
initializeTheme();
const RoleDashboard=lazy(modules.dashboard), FlightSearch=lazy(modules.flights), BookingWizard=lazy(modules.newRequest), Bookings=lazy(modules.bookings), RequestDetail=lazy(modules.detail), FlightAdmin=lazy(modules.operations), Payments=lazy(modules.payments);
const RequestRevision=lazy(modules.revision);
const AppShell=lazy(()=>import('./components/layout/AppShell').then(m=>({default:m.AppShell})));
const query = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: false } } });
class ErrorBoundary extends Component<{children:ReactNode},{error:Error|null}> {
  state={error:null as Error|null};
  static getDerivedStateFromError(error:Error){return {error};}
  componentDidCatch(error:Error,info:ErrorInfo){cancelReloadAnimation();console.error('Travel workspace error',error,info.componentStack);}
  render(){if(this.state.error)return <div className="startup-error"><h1>Your workspace needs a refresh</h1><p>{this.state.error.message}</p><button className="btn btn-primary" onClick={()=>window.location.reload()}>Reload workspace</button></div>;return this.props.children;}
}
async function start() {
  const root=ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<WorkspaceSkeleton/>);
  try { if(!cloudMode)await seedDatabase(); root.render(<React.StrictMode><ErrorBoundary><QueryClientProvider client={query}><AuthProvider><SocketProvider><BrowserRouter><Suspense fallback={<WorkspaceSkeleton/>}><Routes><Route element={<AppShell/>}><Route path="/dashboard" element={<RoleDashboard/>}/><Route path="/flight-status" element={<Navigate to="/flights/search?view=status" replace/>}/><Route path="/flights/search" element={<FlightSearch/>}/><Route path="/bookings/new" element={<RoleGate roles={["REQUESTOR"]}><BookingWizard/></RoleGate>}/><Route path="/bookings/:id/edit" element={<RoleGate roles={["REQUESTOR"]}><RequestRevision/></RoleGate>}/><Route path="/bookings/:id/rebook" element={<RoleGate roles={["REQUESTOR"]}><RequestRevision/></RoleGate>}/><Route path="/bookings" element={<Bookings/>}/><Route path="/bookings/:id" element={<RequestDetail/>}/><Route path="/admin/flights" element={<RoleGate roles={["TMC"]}><FlightAdmin/></RoleGate>}/><Route path="/payments" element={<RoleGate roles={["TMC"]}><Payments/></RoleGate>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Route></Routes></Suspense></BrowserRouter><ThemeToaster/></SocketProvider></AuthProvider></QueryClientProvider></ErrorBoundary></React.StrictMode>); }
  catch(error){cancelReloadAnimation();root.render(<div className="startup-error"><h1>Browser storage is unavailable</h1><p>{error instanceof Error?error.message:'Please enable IndexedDB for this site, then reload.'}</p><button className="btn btn-primary" onClick={()=>window.location.reload()}>Try again</button></div>);}
}
void start();
