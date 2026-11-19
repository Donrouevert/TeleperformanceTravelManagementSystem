import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AccountMenu} from '../components/layout/AccountMenu';
import {demoUsers} from '../db/seed';
afterEach(cleanup);
async function open(onSignOut:()=>Promise<void>){render(<AccountMenu user={{...demoUsers[2],employeeName:'daniel.salenga16@gmail.com',departmentFunction:'Travel Management',position:'Not provided'}} cloud onSignOut={onSignOut}/>);fireEvent.click(screen.getByRole('button',{name:'Account menu for daniel.salenga16'}));return within(await screen.findByRole('dialog'));}
it('keeps the account name readable without email and exposes role/details through an accessible popup',async()=>{
 const popup=await open(vi.fn());expect(popup.getByRole('heading',{name:'My account'})).toBeInTheDocument();expect(popup.getByText('TMC')).toBeInTheDocument();expect(popup.getByText('Travel consultant')).toBeInTheDocument();expect(popup.getByText('Travel Management')).toBeInTheDocument();expect(popup.queryByText(/@gmail/)).toBeNull();expect(popup.queryByText('Not provided')).toBeNull();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape',code:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByRole('button',{name:'Account menu for daniel.salenga16'})).toBeInTheDocument();
});
it('delegates sign-out once and prevents repeated submission while it is pending',async()=>{
 let finish!:()=>void;const signOut=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));const popup=await open(signOut);fireEvent.click(popup.getByRole('button',{name:'Sign out'}));expect(popup.getByRole('button',{name:'Signing out…'})).toBeDisabled();fireEvent.click(popup.getByRole('button',{name:'Signing out…'}));expect(signOut).toHaveBeenCalledOnce();await act(async()=>finish());
});
it('makes a failed sign-out actionable without exposing provider errors',async()=>{
 const signOut=vi.fn().mockRejectedValueOnce(new Error('Provider failure details')).mockResolvedValueOnce(undefined);const popup=await open(signOut);fireEvent.click(popup.getByRole('button',{name:'Sign out'}));expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');expect(screen.queryByText('Provider failure details')).toBeNull();expect(popup.getByRole('button',{name:'Sign out'})).toBeEnabled();fireEvent.click(popup.getByRole('button',{name:'Sign out'}));await waitFor(()=>expect(signOut).toHaveBeenCalledTimes(2));
});
