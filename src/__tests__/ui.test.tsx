import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Check, Badge, Input } from '../components/ui';
afterEach(cleanup);
describe('Accessible interface primitives',()=>{
  it('blocks empty and whitespace-only required text while allowing optional fields',()=>{render(<><Input label="Cost center" required/><Input label="Frequent flyer number"/></>);const required=screen.getByRole('textbox',{name:'Cost center'});expect(required).toBeInvalid();fireEvent.change(required,{target:{value:'   '}});expect(required).toBeInvalid();fireEvent.change(required,{target:{value:'CD-PH-2026'}});expect(required).toBeValid();expect(screen.getByRole('textbox',{name:'Frequent flyer number'})).toBeValid();});
  it('renders lifecycle statuses in readable language',()=>{render(<Badge status="APPROVED_FOR_TMC"/>);expect(screen.getByText('Approved for TMC')).toBeInTheDocument();});
  it('exposes an accessible checkbox label and change event',()=>{let checked=false;render(<Check label="Authorize company billing" checked={false} onChange={value=>{checked=value;}}/>);fireEvent.click(screen.getByRole('checkbox',{name:'Authorize company billing'}));expect(checked).toBe(true);});
});
