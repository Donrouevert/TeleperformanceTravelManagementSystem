import { expect, it } from 'vitest';
import { displayName, displayPerson, displayRequestNames } from '../lib/identity';
import { demoUsers, makeDraft } from '../db/seed';
it.each(['donrouevert','ortalezadarlnrhyn','markjustinppascual','pahayackatherine87'])('shows %s without its email domain',name=>{expect(displayName(name+'@gmail.com')).toBe(name);});
it('preserves real names and removes domains inside historical activity messages',()=>{
 expect(displayName('Gabriel Navarro')).toBe('Gabriel Navarro');expect(displayName('Ticket issued by donrouevert@gmail.com.')).toBe('Ticket issued by donrouevert.');expect(displayName(undefined)).toBe('');
});
it('preserves contact email, role and identity while projecting profile labels',()=>{
 const original={...demoUsers[0],employeeName:'donrouevert@gmail.com',emailAddress:'donrouevert@gmail.com',approvingManagerName:'markjustinppascual@gmail.com'};const shown=displayPerson(original);
 expect(shown.employeeName).toBe('donrouevert');expect(shown.approvingManagerName).toBe('markjustinppascual');expect(shown.emailAddress).toBe(original.emailAddress);expect(shown.employeeId).toBe(original.employeeId);expect(shown.role).toBe(original.role);expect(original.employeeName).toBe('donrouevert@gmail.com');
});
it('cleans legacy booking identities without rewriting signatures, contact data or approval state at rest',()=>{
 const original=makeDraft({...demoUsers[0],employeeName:'ortalezadarlnrhyn@gmail.com',emailAddress:'ortalezadarlnrhyn@gmail.com',approvingManagerName:'markjustinppascual@gmail.com'});
 original.approval.requestedBySignature='ortalezadarlnrhyn@gmail.com';original.approval.approvedBySignature='markjustinppascual@gmail.com';original.adminReview={approved:true,reviewer:'pahayackatherine87@gmail.com',date:'2026-11-16',remarks:'Reviewed'};
 const shown=displayRequestNames(original);expect(shown.requestor.employeeName).toBe('ortalezadarlnrhyn');expect(shown.requestor.approvingManagerName).toBe('markjustinppascual');expect(shown.adminReview?.reviewer).toBe('pahayackatherine87');expect(shown.approval.approvedBySignature).toBe('markjustinppascual');expect(shown.requestor.emailAddress).toBe(original.requestor.emailAddress);expect(shown.status).toBe(original.status);expect(shown.id).toBe(original.id);expect(original.approval.approvedBySignature).toBe('markjustinppascual@gmail.com');
});
