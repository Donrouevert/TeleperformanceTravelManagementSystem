export interface TicketOverrides {
 baseFare?:number; taxesAndFees?:number; baggageFee?:number;
 bookingReferencePnr?:string; ticketNumber?:string; tmcTravelConsultant?:string;
}
export const maximumPhp=9999999999.99;
export function validateTicketOverrides(input:TicketOverrides,excessBaggageKg?:number):string[]{
 const errors:string[]=[];
 for(const [key,label] of [['baseFare','Base fare'],['taxesAndFees','Taxes & fees'],['baggageFee','Excess baggage fee']] as const){
  const n=input[key];if(n!==undefined&&(!Number.isFinite(n)||n<0||n>maximumPhp||Math.abs(n*100-Math.round(n*100))>0.0001))errors.push(label+' must be a non-negative PHP amount with at most two decimal places.');
 }
 if(excessBaggageKg===0&&(input.baggageFee??0)>0)errors.push('An excess baggage fee requires a positive baggage quantity.');
 if(input.bookingReferencePnr?.trim()&&!/^[A-Z0-9]{6}$/.test(input.bookingReferencePnr.trim()))errors.push('PNR must contain exactly six uppercase letters or digits.');
 if(input.ticketNumber?.trim()&&!/^[A-Za-z0-9-]{1,50}$/.test(input.ticketNumber.trim()))errors.push('Ticket number must contain 1–50 letters, digits or hyphens.');
 if(input.tmcTravelConsultant!==undefined&&(!input.tmcTravelConsultant.trim()||input.tmcTravelConsultant.trim().length>120))errors.push('Enter a TMC consultant name (1–120 characters).');
 return errors;
}
