import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FlightTimeRangePicker } from '../features/flights/FlightTimeRangePicker';
afterEach(cleanup);
const open=async(name:string)=>{fireEvent.click(screen.getByRole('button',{name}));return within(await screen.findByRole('dialog'));};
it('only commits valid exact-minute PHT boundaries on Done',async()=>{
 const change=vi.fn();render(<FlightTimeRangePicker label="Departure" from="07:00" until="09:00" onChange={change}/>);
 const popup=await open('Departure from: 07:00');expect(popup.getByText(/Philippine Standard Time/)).toBeInTheDocument();
 fireEvent.click(popup.getByRole('button',{name:'hour 08'}));fireEvent.change(popup.getByRole('textbox',{name:'Minute'}),{target:{value:'37'}});expect(change).not.toHaveBeenCalled();
 fireEvent.click(popup.getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('08:37','09:00');
});
it('blocks reversed boundaries and supports Clear followed by Done',async()=>{
 const change=vi.fn();render(<FlightTimeRangePicker label="Return" from="07:00" until="09:00" onChange={change}/>);
 const popup=await open('Return from: 07:00');fireEvent.click(popup.getByRole('button',{name:'hour 18'}));expect(popup.getByRole('alert')).toHaveTextContent('Until must be on or after From.');expect(popup.getByRole('button',{name:'DONE'})).toBeDisabled();
 fireEvent.click(popup.getByRole('button',{name:'CLEAR'}));expect(change).not.toHaveBeenCalled();fireEvent.click(popup.getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('','');
});
it('discards a draft on Escape and restores the committed boundary on reopen',async()=>{
 const change=vi.fn();render(<FlightTimeRangePicker label="Departure" from="" until="09:00" onChange={change}/>);
 const popup=await open('Departure from: Any time');fireEvent.click(popup.getByRole('button',{name:'hour 06'}));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape',code:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(change).not.toHaveBeenCalled();
 const reopened=await open('Departure from: Any time');expect(reopened.getByRole('button',{name:'From Any time'})).toBeInTheDocument();
});
it('allows either boundary to remain open and keyboard navigation between values',async()=>{
 const change=vi.fn();render(<FlightTimeRangePicker label="Departure" from="" until="" onChange={change}/>);
 const popup=await open('Departure until: Any time');const hour=popup.getByRole('slider',{name:'Hour dial'});fireEvent.keyDown(hour,{key:'ArrowRight'});expect(hour).toHaveAttribute('aria-valuenow','1');fireEvent.click(popup.getByRole('button',{name:'hour 09'}));fireEvent.change(popup.getByRole('textbox',{name:'Minute'}),{target:{value:'59'}});fireEvent.click(popup.getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('','09:59');
});
it('advances from the hour ring to minutes and validates direct HH:mm entry',async()=>{
 const change=vi.fn();render(<FlightTimeRangePicker label="Departure" from="" until="" onChange={change}/>);const popup=await open('Departure from: Any time');
 expect(popup.getByRole('slider',{name:'Hour dial'})).toBeInTheDocument();fireEvent.click(popup.getByRole('button',{name:'hour 17'}));expect(popup.getByRole('slider',{name:'Minute dial'})).toBeInTheDocument();fireEvent.click(popup.getByRole('button',{name:'minute 30'}));expect(popup.getByRole('textbox',{name:'Hour'})).toHaveValue('17');expect(popup.getByRole('textbox',{name:'Minute'})).toHaveValue('30');
 fireEvent.change(popup.getByRole('textbox',{name:'Hour'}),{target:{value:'24'}});expect(popup.getByRole('alert')).toHaveTextContent('00–23');expect(popup.getByRole('button',{name:'DONE'})).toBeDisabled();
 fireEvent.change(popup.getByRole('textbox',{name:'Hour'}),{target:{value:'23'}});fireEvent.change(popup.getByRole('textbox',{name:'Minute'}),{target:{value:'59'}});fireEvent.click(popup.getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('23:59','');
});
