import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SidebarContent } from '../components/layout/SidebarContent';
import type { User } from '../types/travel';
vi.mock('../lib/modules',()=>({preloadModule:vi.fn()}));
const user={employeeName:'Travel Example',employeeId:'EMP-1',role:'REQUESTOR',departmentFunction:'Operations',emailAddress:'example@example.com'} as User;
const content=(compact:boolean)=><MemoryRouter><Tooltip.Provider><SidebarContent user={user} compact={compact} pending={0} onNavigate={()=>{}}/></Tooltip.Provider></MemoryRouter>;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const hover=(name:string)=>{fireEvent.pointerEnter(screen.getByRole('link',{name}),{pointerType:'mouse'});act(()=>vi.advanceTimersByTime(250));};
it('does not reveal tooltips for links hovered before collapsing',()=>{
 const view=render(content(false));hover('Overview');view.rerender(content(true));act(()=>vi.advanceTimersByTime(1000));expect(screen.queryAllByRole('tooltip')).toHaveLength(0);
});
it('shows only the currently hovered icon tooltip and clears it on leaving',()=>{
 render(content(true));hover('Overview');expect(screen.getAllByRole('tooltip')).toHaveLength(1);expect(screen.getByRole('tooltip')).toHaveTextContent('Overview');
 hover('Find a flight');expect(screen.getAllByRole('tooltip')).toHaveLength(1);expect(screen.getByRole('tooltip')).toHaveTextContent('Find a flight');
 fireEvent.pointerLeave(screen.getByRole('link',{name:'Find a flight'}));expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('clears visible and pending tooltips on navigation and expansion',()=>{
 const view=render(content(true));hover('Find a flight');fireEvent.click(screen.getByRole('link',{name:'Find a flight'}));expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
 fireEvent.pointerEnter(screen.getByRole('link',{name:'Overview'}),{pointerType:'mouse'});view.rerender(content(false));act(()=>vi.advanceTimersByTime(1000));expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('preserves keyboard tooltips and clears them on blur or Escape',()=>{
 render(content(true));const link=screen.getByRole('link',{name:'Find a flight'});vi.spyOn(link,'matches').mockImplementation(selector=>selector===':focus-visible');act(()=>link.focus());expect(screen.getByRole('tooltip')).toHaveTextContent('Find a flight');
 fireEvent.keyDown(link,{key:'Escape'});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
 act(()=>link.focus());act(()=>link.blur());expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
