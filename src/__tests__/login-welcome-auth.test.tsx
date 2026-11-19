import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),from:vi.fn(),signOut:vi.fn(),signInWithPassword:vi.fn()}));
vi.mock('../lib/supabase',()=>({cloudMode:true,supabase:{auth:mocks,from:mocks.from}}));
let notify:(event:string,session:unknown)=>void;
const profile={id:'traveler',employee_id:'EMP-1',employee_name:'Travel Example',role:'REQUESTOR'};
beforeEach(()=>{
 vi.useFakeTimers();history.replaceState(null,'','/dashboard');
 mocks.getSession.mockResolvedValue({data:{session:null}});
 mocks.onAuthStateChange.mockImplementation(callback=>{notify=callback;return {data:{subscription:{unsubscribe:vi.fn()}}};});
 mocks.from.mockReturnValue({select:()=>({eq:()=>({single:()=>Promise.resolve({data:profile,error:null})})})});
 mocks.signInWithPassword.mockImplementation(async()=>{notify('SIGNED_IN',{user:{id:'traveler'}});return {error:null};});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
async function open(){render(<QueryClientProvider client={new QueryClient()}><AuthProvider><h1>Private dashboard</h1></AuthProvider></QueryClientProvider>);await act(async()=>{});}
async function login(){fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'traveler@example.com'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'example-password'}});await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Sign in'}));});await act(async()=>{await vi.advanceTimersByTimeAsync(0);});}
it('animates successful explicit sign-in while warming the inaccessible dashboard underneath',async()=>{
 await open();await login();expect(screen.getByRole('status')).toHaveAccessibleName('Opening your Teleperformance travel workspace');expect(screen.getByText('Private dashboard').closest('[inert]')).toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Private dashboard'})).not.toBeInTheDocument();
 await act(async()=>{await vi.advanceTimersByTimeAsync(950);});await act(async()=>{await vi.advanceTimersByTimeAsync(220);});expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'Private dashboard'})).toBeInTheDocument();
 await act(async()=>{notify('SIGNED_IN',{user:{id:'traveler'}});await vi.advanceTimersByTimeAsync(0);});expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('leaves failed sign-in on the form without a welcome screen',async()=>{
 mocks.signInWithPassword.mockResolvedValue({error:new Error('Wrong credentials')});await open();await login();expect(screen.getByRole('alert')).toHaveTextContent('Check your email and password');expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument();
});
it('returns to sign-in if a successful login has no provisioned profile',async()=>{
 mocks.from.mockReturnValue({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null,error:new Error('Missing profile')})})})});await open();await login();expect(screen.getByRole('alert')).toHaveTextContent('provisioned employee profile');expect(document.querySelector('.login-welcome')).not.toBeInTheDocument();expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument();
});
it('dismisses the welcome screen when profile loading throws',async()=>{
 mocks.from.mockReturnValue({select:()=>({eq:()=>({single:()=>Promise.reject(new Error('Network failure'))})})});await open();await login();expect(screen.getByRole('alert')).toHaveTextContent('Unable to open your account');expect(document.querySelector('.login-welcome')).not.toBeInTheDocument();
});
