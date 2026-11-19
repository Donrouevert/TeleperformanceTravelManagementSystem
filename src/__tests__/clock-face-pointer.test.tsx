import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClockFace } from '../features/flights/ClockFace';
afterEach(cleanup);
it('drags the minute hand without auto-advancing until release',()=>{
 const pick=vi.fn();render(<ClockFace part="minute" value={0} onPick={pick}/>);const group=screen.getByRole('group',{name:'Minute clock'});
 vi.spyOn(group,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:240,bottom:240,width:240,height:240,x:0,y:0,toJSON:()=>({})});
 fireEvent.pointerDown(screen.getByRole('slider',{name:'Minute dial'}),{pointerId:1,button:0,clientX:219,clientY:120});
 expect(pick).toHaveBeenLastCalledWith(15,false);
 fireEvent.pointerMove(group,{pointerId:1,clientX:120,clientY:219});expect(pick).toHaveBeenLastCalledWith(30,false);
 fireEvent.pointerUp(group,{pointerId:1,clientX:21,clientY:120});expect(pick).toHaveBeenLastCalledWith(45,true);
});
