import { useId, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Clock3 } from 'lucide-react';
import { ClockFace, type ClockPart } from './ClockFace';
import './flight-search.css';
import './clock-time-picker.css';
interface Props { label: 'Departure' | 'Return'; from: string; until: string; single?: boolean; required?: boolean; onChange: (from: string, until: string) => void; }
const pad = (value: number | string) => String(value).padStart(2, '0');
const parts = (time: string) => ({ hour: time.split(':')[0] || '00', minute: time.split(':')[1] || '00' });
const validPart = (part: ClockPart, value: string) => /^\d{1,2}$/.test(value) && Number(value) <= (part === 'hour' ? 23 : 59);
export function FlightTimeRangePicker({ label, from, until, single=false, required=false, onChange }: Props) {
  const requiredId=useId();
  const fields:('from'|'until')[]=single?['from']:['from','until'];
  const preferenceLabel='Preferred '+label.toLowerCase()+' time (PHT)';
  const [open, setOpen] = useState(false), [active, setActive] = useState<'from' | 'until'>('from');
  const [draft, setDraft] = useState({ from, until }), [mode, setMode] = useState<ClockPart>('hour');
  const [text, setText] = useState(parts(from));
  const invalidRange = !single && !!draft.from && !!draft.until && draft.until < draft.from;
  const invalidInput = !validPart('hour', text.hour) || !validPart('minute', text.minute);
  const begin = (field: 'from' | 'until') => { setDraft({ from, until }); setActive(field); setMode('hour'); setText(parts(field === 'from' ? from : until)); };
  const changeBoundary = (field: 'from' | 'until') => { setActive(field); setMode('hour'); setText(parts(draft[field])); };
  const pick = (part: ClockPart, value: number, advance = true) => {
    const next = { hour: validPart('hour', text.hour) ? pad(text.hour) : '00', minute: validPart('minute', text.minute) ? pad(text.minute) : '00', [part]: pad(value) };
    setText(next); setDraft(old => ({ ...old, [active]: next.hour + ':' + next.minute }));
    if (part === 'hour' && advance) setMode('minute');
  };
  const typePart = (part: ClockPart, value: string) => {
    if (!/^\d{0,2}$/.test(value)) return;
    const next = { ...text, [part]: value }; setText(next);
    if (validPart('hour', next.hour) && validPart('minute', next.minute)) setDraft(old => ({ ...old, [active]: pad(next.hour) + ':' + pad(next.minute) }));
  };
  return <Popover.Root open={open} onOpenChange={setOpen}><fieldset className={"flight-time-range"+(single?" is-single":"")}>{!single&&<legend>{label} window <span>· PHT</span>{required&&<span className="required-mark" aria-hidden="true"> *</span>}</legend>}{required&&<span id={requiredId} className="sr-only">Required</span>}<div className="time-range-triggers">{fields.map(field => <Popover.Trigger key={field} className={'time-trigger ' + (open && active === field ? 'is-active' : '')} aria-describedby={required?requiredId:undefined} aria-label={(single?preferenceLabel:label+' '+field)+': '+((field==='from'?from:until)||(single?'Choose time':'Any time'))} onClick={() => begin(field)}><span><b>{single?preferenceLabel:field==='from'?'From':'Until'}{single&&required&&<span className="required-mark" aria-hidden="true"> *</span>}</b><span>{(field==='from'?from:until)||(single?'Choose time':'Any time')}</span></span><Clock3 size={17}/></Popover.Trigger>)}</div>{single&&<small className="time-single-hint">PHT · 24-hour clock</small>}</fieldset>
    <Popover.Portal><Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="flight-time-positioner"><Popover.Popup className="flight-time-popup clock-time-popup">
      <header className="clock-popup-heading"><Popover.Title>{label} time</Popover.Title><Popover.Description>PHT · 24-hour clock</Popover.Description></header>
      {!single&&<div className="clock-boundary-tabs">{(['from', 'until'] as const).map(field => <button type="button" key={field} aria-label={(field === 'from' ? 'From ' : 'Until ') + (draft[field] || 'Any time')} aria-pressed={active === field} onClick={() => changeBoundary(field)}>{field === 'from' ? 'From' : 'Until'}<span>{draft[field] || 'Any time'}</span></button>)}</div>}
      <div className="clock-digital-display">{(['hour', 'minute'] as const).map((part, index) => <span key={part}>{index === 1 && <b aria-hidden="true">:</b>}<input aria-label={part === 'hour' ? 'Hour' : 'Minute'} type="text" inputMode="numeric" maxLength={2} pattern={part === 'hour' ? '(?:[01]?[0-9]|2[0-3])' : '[0-5]?[0-9]'} value={text[part]} aria-invalid={!validPart(part, text[part])} className={mode === part ? 'is-active' : ''} onFocus={event => { setMode(part); event.target.select(); }} onChange={event => typePart(part, event.target.value)} onBlur={() => { if (validPart(part, text[part])) setText(old => ({ ...old, [part]: pad(old[part]) })); }}/></span>)}</div>
      <p className="clock-mode-hint" aria-live="polite">{mode === 'hour' ? 'Choose hour · inner 1–12 / outer 13–00' : 'Choose minute · drag the hand for any minute'}</p>
      <ClockFace part={mode} value={validPart(mode,text[mode]) ? Number(text[mode]) : 0} onPick={(value, advance) => pick(mode, value, advance)}/>
      <div className="clock-validation" aria-live="polite">{invalidInput ? <p role="alert">Enter an hour from 00–23 and a minute from 00–59.</p> : invalidRange ? <p role="alert">Until must be on or after From.</p> : <p>Times are in Philippine Standard Time.</p>}</div>
      <footer className="flight-picker-actions"><button type="button" onClick={() => { setDraft({ from: '', until: '' }); setActive('from'); setText(parts('')); setMode('hour'); }}>CLEAR</button><button type="button" className="calendar-done" disabled={invalidInput || invalidRange} onClick={() => { onChange(draft.from, single?'':draft.until); setOpen(false); }}>DONE</button></footer>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
