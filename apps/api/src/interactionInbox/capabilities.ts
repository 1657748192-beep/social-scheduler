import type {CapabilityDto,CapabilityEvidence} from './types';
export function evaluateCapability(e:CapabilityEvidence):CapabilityDto{
 const validTime=e.verifiedAt!==null&&Number.isFinite(Date.parse(e.verifiedAt))&&Date.parse(e.verifiedAt)<=Date.now();
 const reason=!e.integrated?'not_integrated':!e.productOpen?'not_open':!e.supported?'unsupported':e.approval==='unknown'?'approval_unverified':e.approval==='pending'?'review_pending':e.approval!=='approved'?'approval_rejected':e.grant==='expired'?'authorization_expired':e.grant!=='valid'?'authorization_required':!e.roleAllowed?'forbidden':!validTime?'verification_required':e.providerRestriction??'available';
 return{capability:e.capability,available:reason==='available',reason,verifiedAt:e.verifiedAt};
}
