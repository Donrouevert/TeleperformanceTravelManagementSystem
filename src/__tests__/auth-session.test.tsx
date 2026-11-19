import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),from:vi.fn(),signOut:vi.fn()}));
vi.mock('../lib/supabase',()=>({cloudMode:true,supabase:{auth:mocks,from:mocks.from}}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('preserves the page and query cache when Supabase repeats SIGNED_IN for the same user',async()=>{
 history.replaceState(null,'','/dashboard');
 const session={user:{id:'same-user'}};
 mocks.getSession.mockResolvedValue({data:{session}});
 let notify!:(event:string,session:unknown)=>void;
 mocks.onAuthStateChange.mockImplementation(callback=>{notify=callback;return {data:{subscription:{unsubscribe:vi.fn()}}};});
 const single=vi.fn().mockResolvedValue({data:{id:'same-user',employee_id:'EMP-1',employee_name:'Example Employee',role:'REQUESTOR'},error:null});
 mocks.from.mockReturnValue({select:()=>({eq:()=>({single})})});
 const query=new QueryClient(),clear=vi.spyOn(query,'clear');
 function Page(){const [count,setCount]=useState(0);return <button onClick={()=>setCount(count+1)}>Draft {count}</button>;}
 render(<QueryClientProvider client={query}><AuthProvider><Page/></AuthProvider></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Draft 0'}));
 query.setQueryData(['requests','same-user','REQUESTOR'],['cached-record']);
 await act(async()=>{notify('SIGNED_IN',session);notify('TOKEN_REFRESHED',session);await new Promise(resolve=>setTimeout(resolve,10));});
 expect(screen.getByRole('button',{name:'Draft 1'})).toBeInTheDocument();
 expect(query.getQueryData(['requests','same-user','REQUESTOR'])).toEqual(['cached-record']);
 expect(single).toHaveBeenCalledOnce();expect(clear).toHaveBeenCalledOnce();
 await act(async()=>{notify('SIGNED_OUT',null);await new Promise(resolve=>setTimeout(resolve,10));});
 expect(screen.getByRole('heading',{name:'Welcome back.'})).toBeInTheDocument();
 expect(query.getQueryData(['requests','same-user','REQUESTOR'])).toBeUndefined();
});

it('projects provisioned email names without changing sign-in/contact addresses',async()=>{
 history.replaceState(null,'','/dashboard');mocks.getSession.mockResolvedValue({data:{session:{user:{id:'email-name-user'}}}});
 mocks.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
 const single=vi.fn().mockResolvedValue({data:{id:'email-name-user',employee_id:'EMP-1',employee_name:'donrouevert@gmail.com',email_address:'donrouevert@gmail.com',role:'TMC'},error:null});mocks.from.mockReturnValue({select:()=>({eq:()=>({single})})});
 function Identity(){const {user}=useAuth();return <><span data-testid="name">{user.employeeName}</span><span data-testid="contact">{user.emailAddress}</span></>;}
 render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Identity/></AuthProvider></QueryClientProvider>);
 expect(await screen.findByTestId('name')).toHaveTextContent(/^donrouevert$/);expect(screen.getByTestId('contact')).toHaveTextContent('donrouevert@gmail.com');
});
