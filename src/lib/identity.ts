import type { Requestor, TravelRequest } from '../types/travel';

/** Identity labels use the email's local name when a profile was provisioned with an email as its name. */
export function displayName(value: string | undefined): string {
  return (value ?? '').replace(/([A-Z0-9._%+-]+)@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '$1');
}
export function displayPerson<T extends Requestor>(person: T): T {
  return { ...person, employeeName: displayName(person.employeeName), approvingManagerName: displayName(person.approvingManagerName) };
}
/** Project legacy snapshots for display; contact addresses and stored approval records remain intact. */
export function displayRequestNames(request: TravelRequest): TravelRequest {
  return {
    ...request,
    requestor: displayPerson(request.requestor),
    approval: { ...request.approval, requestedBySignature: displayName(request.approval.requestedBySignature), approvedBySignature: request.approval.approvedBySignature === undefined ? undefined : displayName(request.approval.approvedBySignature) },
    adminReview: request.adminReview ? { ...request.adminReview, reviewer: displayName(request.adminReview.reviewer) } : undefined,
    tmcFulfillment: request.tmcFulfillment ? { ...request.tmcFulfillment, tmcTravelConsultant: displayName(request.tmcFulfillment.tmcTravelConsultant) } : undefined,
  };
}
