import { act, cleanup, render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { completeReloadAnimation, cancelReloadAnimation } from '../lib/reloadAnimation';
import { ReloadReady } from '../components/ReloadReady';
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));});
afterEach(()=>{cleanup();cancelReloadAnimation();document.getElementById('root')?.remove();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
function prepare(){document.documentElement.dataset.reloading='true';document.documentElement.dataset.reloadStarted=String(performance.now());document.body.insertAdjacentHTML('beforeend','<div id="reload-screen" role="status">Refreshing your workspace</div><div id="root"><main><div class="module-transition" tabindex="-1">Dashboard</div></main></div>');}
it('holds the reload screen until ready and then fades into the accessible workspace',()=>{
 prepare();act(()=>vi.advanceTimersByTime(500));expect(screen.getByRole('status')).toBeInTheDocument();completeReloadAnimation();act(()=>vi.advanceTimersByTime(149));expect(document.documentElement.dataset.reloading).toBe('true');act(()=>vi.advanceTimersByTime(1));expect(document.documentElement.dataset.reloading).toBe('leaving');expect(document.getElementById('root')).toHaveProperty('inert',true);expect(document.getElementById('root')).toHaveAttribute('aria-hidden','true');act(()=>vi.advanceTimersByTime(180));expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(document.getElementById('root')).toHaveProperty('inert',false);expect(document.getElementById('root')).not.toHaveAttribute('aria-hidden');expect(document.activeElement).toHaveClass('module-transition');
});
it('does not add an entrance delay after a slow session restore',()=>{
 prepare();act(()=>vi.advanceTimersByTime(2000));completeReloadAnimation();act(()=>vi.advanceTimersByTime(0));expect(document.documentElement.dataset.reloading).toBe('leaving');act(()=>vi.advanceTimersByTime(180));expect(document.getElementById('reload-screen')).not.toBeInTheDocument();
});
it('handles repeated readiness signals once and releases immediately on an error',()=>{
 prepare();completeReloadAnimation();completeReloadAnimation();expect(vi.getTimerCount()).toBe(1);cancelReloadAnimation();expect(document.getElementById('reload-screen')).not.toBeInTheDocument();expect(vi.getTimerCount()).toBe(0);act(()=>vi.advanceTimersByTime(2000));expect(document.documentElement.dataset.reloading).toBeUndefined();
});
it('skips animation time when reduced motion is requested',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));prepare();completeReloadAnimation();act(()=>vi.advanceTimersByTime(0));act(()=>vi.advanceTimersByTime(1));expect(document.getElementById('reload-screen')).not.toBeInTheDocument();
});
it('does not animate initial navigation or later module readiness',()=>{
 prepare();document.documentElement.dataset.reloading='false';completeReloadAnimation();expect(document.getElementById('reload-screen')).not.toBeInTheDocument();expect(vi.getTimerCount()).toBe(0);completeReloadAnimation();expect(vi.getTimerCount()).toBe(0);
});
it('waits until lazy route content commits before starting the exit',async()=>{
 prepare();let resolve!:(module:{default:()=>React.ReactNode})=>void;const Page=lazy(()=>new Promise<{default:()=>React.ReactNode}>(done=>{resolve=done;}));render(<Suspense fallback={<p>Preparing route</p>}><Page/><ReloadReady/></Suspense>);act(()=>vi.advanceTimersByTime(2000));expect(document.documentElement.dataset.reloading).toBe('true');await act(async()=>{resolve({default:()=> <h1>Ready route</h1>});});act(()=>vi.advanceTimersByTime(0));act(()=>vi.advanceTimersByTime(180));expect(document.getElementById('reload-screen')).not.toBeInTheDocument();
});
it.each(['reload','navigate','back_forward'])('detects a %s navigation in the early HTML bootstrap',type=>{
 vi.stubGlobal('performance',{now:()=>123,getEntriesByType:()=>[{type}]});const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);const bootstrap=scripts.find(script=>script.includes('data')&&script.includes('reloadStarted'))!;expect(bootstrap).toBeTruthy();new Function(bootstrap)();expect(document.documentElement.dataset.reloading).toBe(String(type==='reload'));expect(document.documentElement.dataset.reloadStarted).toBe(type==='reload'?'123':undefined);
});
