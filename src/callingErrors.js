export const missingOutperoNumber='No outbound phone number is assigned to this Outpero agent. Add a number in Outpero, assign it to this agent, then refresh agents and retry.';

// Explain historical failures too, without changing the stored audit record.
export function callingErrorMessage(message){
  return /\bno_phone_number\b/.test(message||'')?missingOutperoNumber:message;
}
