import { expect, it } from 'vitest';
import { clockValueAtPoint } from '../features/flights/ClockFace';
it('maps the inner and outer hour rings to distinct 24-hour values',()=>{
 expect(clockValueAtPoint(120,20,240,'hour')).toBe(0);expect(clockValueAtPoint(120,51,240,'hour')).toBe(12);
 expect(clockValueAtPoint(219,120,240,'hour')).toBe(15);expect(clockValueAtPoint(189,120,240,'hour')).toBe(3);
 expect(clockValueAtPoint(120,219,240,'hour')).toBe(18);expect(clockValueAtPoint(120,189,240,'hour')).toBe(6);
});
it('supports exact minutes and rejects center, outside and zero-sized clicks',()=>{
 expect(clockValueAtPoint(120,20,240,'minute')).toBe(0);expect(clockValueAtPoint(219,120,240,'minute')).toBe(15);expect(clockValueAtPoint(120,219,240,'minute')).toBe(30);expect(clockValueAtPoint(21,120,240,'minute')).toBe(45);
 const a=37*6*Math.PI/180;expect(clockValueAtPoint(120+99*Math.sin(a),120-99*Math.cos(a),240,'minute')).toBe(37);
 expect(clockValueAtPoint(120,120,240,'hour')).toBeNull();expect(clockValueAtPoint(0,0,240,'hour')).toBeNull();expect(clockValueAtPoint(0,0,0,'minute')).toBeNull();
});
