import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../components/ThemeToggle';
import { initializeTheme, preferredTheme, THEME_KEY } from '../lib/theme';
let darkSystem=false,reduced=false;
const listeners=new Set<()=>void>();
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();delete document.documentElement.dataset.theme;document.documentElement.classList.remove('theme-switching');darkSystem=false;reduced=false;listeners.clear();vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:query.includes('reduced-motion')?reduced:darkSystem,media:query,addEventListener:(_type:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_type:string,fn:()=>void)=>listeners.delete(fn)})));});
afterEach(()=>{cleanup();vi.runOnlyPendingTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();delete document.documentElement.dataset.theme;document.documentElement.style.colorScheme='';document.documentElement.classList.remove('theme-switching');});
it('toggles both themes, remembers the preference and clears the transition state',()=>{
 initializeTheme();render(<ThemeToggle/>);fireEvent.click(screen.getByRole('button',{name:'Switch to dark mode'}));expect(document.documentElement).toHaveAttribute('data-theme','dark');expect(document.documentElement.style.colorScheme).toBe('dark');expect(localStorage.getItem(THEME_KEY)).toBe('dark');expect(screen.getByRole('button',{name:'Switch to light mode'})).toHaveAttribute('aria-pressed','true');expect(document.documentElement).toHaveClass('theme-switching');act(()=>vi.advanceTimersByTime(280));expect(document.documentElement).not.toHaveClass('theme-switching');fireEvent.click(screen.getByRole('button',{name:'Switch to light mode'}));expect(localStorage.getItem(THEME_KEY)).toBe('light');expect(document.documentElement).toHaveAttribute('data-theme','light');
});
it('restores a stored preference before rendering controls',()=>{
 localStorage.setItem(THEME_KEY,'dark');initializeTheme();render(<ThemeToggle/>);expect(screen.getByRole('button',{name:'Switch to light mode'})).toBeInTheDocument();expect(document.documentElement).not.toHaveClass('theme-switching');
});
it('uses system appearance until the user selects an explicit preference',()=>{
 darkSystem=true;expect(preferredTheme()).toBe('dark');initializeTheme();render(<ThemeToggle/>);act(()=>{darkSystem=false;listeners.forEach(fn=>fn());});expect(screen.getByRole('button',{name:'Switch to dark mode'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Switch to dark mode'}));act(()=>{darkSystem=false;listeners.forEach(fn=>fn());});expect(document.documentElement).toHaveAttribute('data-theme','dark');
});
it('respects reduced motion and still switches when storage is unavailable',()=>{
 reduced=true;initializeTheme();render(<ThemeToggle/>);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable');});fireEvent.click(screen.getByRole('button',{name:'Switch to dark mode'}));expect(document.documentElement).toHaveAttribute('data-theme','dark');expect(document.documentElement).not.toHaveClass('theme-switching');
});
it('synchronizes changes made in another tab',()=>{
 initializeTheme();render(<ThemeToggle/>);act(()=>{localStorage.setItem(THEME_KEY,'dark');window.dispatchEvent(new StorageEvent('storage',{key:THEME_KEY,newValue:'dark'}));});expect(screen.getByRole('button',{name:'Switch to light mode'})).toBeInTheDocument();
});
it('keeps current form state mounted during theme changes',()=>{
 initializeTheme();function Form(){const [value,setValue]=useState('');return <><ThemeToggle/><label>Draft<input value={value} onChange={e=>setValue(e.target.value)}/></label></>;}
 render(<Form/>);fireEvent.change(screen.getByLabelText('Draft'),{target:{value:'Keep this journey'}});fireEvent.click(screen.getByRole('button',{name:'Switch to dark mode'}));expect(screen.getByLabelText('Draft')).toHaveValue('Keep this journey');
});
it('ignores malformed saved preferences',()=>{localStorage.setItem(THEME_KEY,'unknown');darkSystem=true;initializeTheme();expect(document.documentElement).toHaveAttribute('data-theme','dark');});
