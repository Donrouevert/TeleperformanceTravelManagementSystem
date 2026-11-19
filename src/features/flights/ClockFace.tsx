import { useRef, type CSSProperties, type PointerEvent } from 'react';
export type ClockPart = 'hour' | 'minute';
const pad = (value: number) => String(value).padStart(2, '0');

/** Translate the 24-hour inner/outer rings or minute dial into an exact value. */
export function clockValueAtPoint(x: number, y: number, size: number, part: ClockPart): number | null {
  if (size <= 0 || ![x,y,size].every(Number.isFinite)) return null;
  const dx = x - size / 2, dy = y - size / 2, distance = Math.hypot(dx, dy);
  if (distance < size * .14 || distance > size * .5) return null;
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
  if (part === 'minute') return Math.round(angle / 6) % 60;
  const hour = Math.round(angle / 30) % 12;
  return distance > size * .355 ? (hour === 0 ? 0 : hour + 12) : (hour === 0 ? 12 : hour);
}

export function ClockFace({ part, value, onPick }: { part: ClockPart; value: number; onPick: (value: number, advance?: boolean) => void }) {
  const dragging = useRef(false);
  const isHour = part === 'hour', maximum = isHour ? 23 : 59;
  const angle = value * (isHour ? 30 : 6) * Math.PI / 180;
  const radius = isHour && value > 0 && value <= 12 ? 69 : 99;
  const point = { x: 120 + radius * Math.sin(angle), y: 120 - radius * Math.cos(angle) };
  const numbers = isHour ? Array.from({ length: 24 }, (_, n) => n) : Array.from({ length: 12 }, (_, n) => n * 5);
  const pickPointer = (event: PointerEvent<HTMLDivElement>, advance: boolean) => {
    const box = event.currentTarget.getBoundingClientRect();
    const selected = clockValueAtPoint(event.clientX - box.left, event.clientY - box.top, box.width, part);
    if (selected !== null) onPick(selected, advance);
  };
  return <div className="clock-face" role="group" aria-label={isHour ? 'Hour clock' : 'Minute clock'}
    onKeyDown={event => { const step = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0; if (step || event.key === 'Home' || event.key === 'End') { event.preventDefault(); onPick(event.key === 'Home' ? 0 : event.key === 'End' ? maximum : (value + step + maximum + 1) % (maximum + 1), false); } }}
    onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; if (event.button !== 0) return; event.preventDefault(); dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); pickPointer(event, false); }}
    onPointerMove={event => { if (dragging.current) pickPointer(event, false); }}
    onPointerUp={event => { if (!dragging.current) return; dragging.current = false; pickPointer(event, true); }}
    onPointerCancel={() => { dragging.current = false; }}>
    <div className="clock-dial-control" role="slider" aria-label={isHour ? 'Hour dial' : 'Minute dial'} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={value} aria-valuetext={pad(value)} tabIndex={0}/>
    <svg viewBox="0 0 240 240" aria-hidden="true" className="clock-face-drawing"><circle cx="120" cy="120" r="118" className="clock-face-rim"/>{!isHour && Array.from({ length: 60 }, (_, n) => { const a = n * 6 * Math.PI / 180; return <line key={n} x1={120 + 112 * Math.sin(a)} y1={120 - 112 * Math.cos(a)} x2={120 + (n % 5 ? 115 : 117) * Math.sin(a)} y2={120 - (n % 5 ? 115 : 117) * Math.cos(a)} className="clock-tick"/>; })}<line x1="120" y1="120" x2={point.x} y2={point.y} className="clock-hand"/><circle cx="120" cy="120" r="3" className="clock-pivot"/>{!isHour && value % 5 !== 0 && <circle cx={point.x} cy={point.y} r="5" className="clock-pivot"/>}</svg>
    {numbers.map(number => { const a = number * (isHour ? 30 : 6) * Math.PI / 180, r = isHour && number > 0 && number <= 12 ? 69 : 99; return <button type="button" tabIndex={-1} className={'clock-number ' + (value === number ? 'is-selected ' : '') + (isHour && (number === 0 || number > 12) ? 'is-outer' : '')} aria-label={part + ' ' + pad(number)} aria-pressed={value === number} key={number} style={{ left: (50 + r / 240 * 100 * Math.sin(a)) + '%', top: (50 - r / 240 * 100 * Math.cos(a)) + '%' } as CSSProperties} onClick={() => onPick(number, true)}>{isHour && number > 0 && number <= 12 ? number : pad(number)}</button>; })}
  </div>;
}
