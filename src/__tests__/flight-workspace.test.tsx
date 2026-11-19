import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FlightWorkspace } from '../features/flights/FlightWorkspace';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{authId:'account-one',employeeId:'EMP-1'}})}));
vi.mock('../features/flights/FlightSearch',()=>({FlightSearch:()=>{const [city,setCity]=useState('Cebu');return <label>Saved search destination<input value={city} onChange={e=>setCity(e.target.value)}/></label>;}}));
let query:QueryClient;
beforeEach(()=>{query=new QueryClient();mocks.invoke.mockResolvedValue({data:{data:[],fetchedAt:new Date().toISOString(),cached:false},error:null});});
afterEach(()=>{cleanup();query.clear();vi.clearAllMocks();});
function URL(){const l=useLocation();return <output data-testid="url">{l.pathname+l.search}</output>;}
const open=(path='/flights/search')=>render(<QueryClientProvider client={query}><MemoryRouter initialEntries={[path]}><FlightWorkspace/><URL/></MemoryRouter></QueryClientProvider>);
it('places status in the flight tools bar, preserves searches and never looks up on tab activation',async()=>{
 open();expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);expect(screen.getByRole('tab',{name:'Find flights'})).toHaveAttribute('aria-selected','true');expect(screen.queryByLabelText('Flight number')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Saved search destination'),{target:{value:'Davao'}});fireEvent.click(screen.getByRole('tab',{name:'Live flight status'}));
 expect(await screen.findByRole('textbox',{name:'Flight number'})).toBeInTheDocument();expect(screen.getByTestId('url')).toHaveTextContent('/flights/search?view=status');expect(mocks.invoke).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('textbox',{name:'Flight number'}),{target:{value:'PR2845'}});
 fireEvent.click(screen.getByRole('tab',{name:'Find flights'}));expect(screen.getByLabelText('Saved search destination')).toHaveValue('Davao');
 fireEvent.click(screen.getByRole('tab',{name:'Live flight status'}));expect(screen.getByRole('textbox',{name:'Flight number'})).toHaveValue('PR2845');expect(mocks.invoke).not.toHaveBeenCalled();
});
it('restores direct status links and preserves a submitted result across tab changes',async()=>{
 open('/flights/search?view=status&eco=true');expect(screen.getByRole('tab',{name:'Live flight status'})).toHaveAttribute('aria-selected','true');const number=await screen.findByRole('textbox',{name:'Flight number'});fireEvent.change(number,{target:{value:'PR2845'}});expect(mocks.invoke).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Check status'}));
 await screen.findByRole('heading',{name:'No live status found for PR2845'});expect(mocks.invoke).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('tab',{name:'Find flights'}));expect(screen.getByTestId('url')).toHaveTextContent('eco=true');fireEvent.click(screen.getByRole('tab',{name:'Live flight status'}));expect(screen.getByRole('heading',{name:'No live status found for PR2845'})).toBeInTheDocument();expect(mocks.invoke).toHaveBeenCalledOnce();
});
it('supports keyboard switching between the two tools',async()=>{
 open();const search=screen.getByRole('tab',{name:'Find flights'});act(()=>search.focus());fireEvent.keyDown(search,{key:'ArrowRight'});await waitFor(()=>expect(screen.getByRole('tab',{name:'Live flight status'})).toHaveFocus());fireEvent.keyDown(screen.getByRole('tab',{name:'Live flight status'}),{key:'Enter'});expect(await screen.findByRole('textbox',{name:'Flight number'})).toBeInTheDocument();
});
