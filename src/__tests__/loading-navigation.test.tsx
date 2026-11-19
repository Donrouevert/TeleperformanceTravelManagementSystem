import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { lazy, useState } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Skeleton, WorkspaceSkeleton } from '../components/Skeleton';
import { ModuleTransition } from '../components/layout/ModuleTransition';
import { moduleForPath, skeletonForPath } from '../lib/modules';

beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Loading and module navigation',()=>{
 it.each(['dashboard','table','detail','flights','form','status'] as const)('announces %s loading without exposing decorative controls',layout=>{render(<Skeleton layout={layout} fullPage/>);expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(screen.queryByRole('textbox')).not.toBeInTheDocument();expect(screen.queryByRole('table')).not.toBeInTheDocument();});
 it('shows branded workspace placeholders during initial session loading',()=>{render(<WorkspaceSkeleton/>);expect(screen.getByAltText('Teleperformance')).toBeInTheDocument();expect(screen.getByRole('status')).toHaveAccessibleName('Opening your travel workspace');});
 it('shows the destination immediately and keeps filter changes from remounting its state',()=>{
   function Page(){const [count,setCount]=useState(0);return <><h1>Travel requests</h1><button onClick={()=>setCount(count+1)}>Count {count}</button></>;}
   render(<MemoryRouter initialEntries={['/dashboard']}><Link to="/bookings">Requests</Link><Link to="/bookings?status=TICKETED">Filter</Link><ModuleTransition><Routes><Route path="/dashboard" element={<h1>Overview</h1>}/><Route path="/bookings" element={<Page/>}/></Routes></ModuleTransition></MemoryRouter>);
   fireEvent.click(screen.getByRole('link',{name:'Requests'}));
   expect(screen.getByRole('heading',{name:'Travel requests'})).toBeInTheDocument();
   expect(screen.queryByRole('heading',{name:'Overview'})).not.toBeInTheDocument();
   expect(document.activeElement).toHaveClass('module-transition');
   expect(window.scrollTo).toHaveBeenCalledOnce();
   fireEvent.click(screen.getByRole('button',{name:'Count 0'}));fireEvent.click(screen.getByRole('link',{name:'Filter'}));
   expect(screen.getByRole('button',{name:'Count 1'})).toBeInTheDocument();expect(window.scrollTo).toHaveBeenCalledOnce();
 });
 it('replaces a lazy module skeleton as soon as its code is ready',async()=>{
   let resolve!:(module:{default:()=>React.ReactNode})=>void;
   const Component=lazy(()=>new Promise<{default:()=>React.ReactNode}>(done=>{resolve=done;}));
   render(<MemoryRouter initialEntries={['/bookings']}><ModuleTransition><Component/></ModuleTransition></MemoryRouter>);
   expect(screen.getByRole('status')).toHaveAccessibleName('Loading this module');
   await act(async()=>resolve({default:()=> <h1>Loaded requests</h1>}));
   expect(screen.getByRole('heading',{name:'Loaded requests'})).toBeInTheDocument();expect(screen.queryByRole('status')).not.toBeInTheDocument();
 });
 it('chooses request and detail modules before general booking routes',()=>{expect(moduleForPath('/bookings/new')).toBe('newRequest');expect(moduleForPath('/bookings/demo?tab=approval')).toBe('detail');expect(skeletonForPath('/payments')).toBe('dashboard');expect(skeletonForPath('/flight-status')).toBe('status');});
});
