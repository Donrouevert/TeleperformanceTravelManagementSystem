import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoginWelcome } from '../features/auth/LoginWelcome';
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('plays the logo then fades out once the workspace is ready',()=>{
 const done=vi.fn();const view=render(<LoginWelcome ready={false} onComplete={done}/>);
 expect(screen.getByRole('status')).toHaveAccessibleName('Opening your Teleperformance travel workspace');expect(screen.getByRole('img',{name:'Teleperformance'})).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(2000));expect(done).not.toHaveBeenCalled();expect(screen.getByText('Preparing your travel workspace…')).toBeInTheDocument();
 view.rerender(<LoginWelcome ready onComplete={done}/>);expect(document.querySelector('.login-welcome')).toHaveClass('is-leaving');act(()=>vi.advanceTimersByTime(220));expect(done).toHaveBeenCalledOnce();
});
it('keeps a brief animation even when preparation completes immediately',()=>{
 const done=vi.fn();render(<LoginWelcome ready onComplete={done}/>);act(()=>vi.advanceTimersByTime(949));expect(done).not.toHaveBeenCalled();expect(document.querySelector('.login-welcome')).not.toHaveClass('is-leaving');act(()=>vi.advanceTimersByTime(1));act(()=>vi.advanceTimersByTime(220));expect(done).toHaveBeenCalledOnce();
});
it('skips the animation delay for reduced motion',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));const done=vi.fn();render(<LoginWelcome ready onComplete={done}/>);act(()=>vi.advanceTimersByTime(0));act(()=>vi.advanceTimersByTime(1));expect(done).toHaveBeenCalledOnce();
});
it('cancels completion after unmount',()=>{
 const done=vi.fn();const view=render(<LoginWelcome ready onComplete={done}/>);view.unmount();act(()=>vi.advanceTimersByTime(5000));expect(done).not.toHaveBeenCalled();
});
