import {HttpError} from '../../utils/errors';import {capabilities,type InboxAdapter} from '../types';
export function createDisabledAdapter():InboxAdapter{
 const unavailable=async():Promise<never>=>{throw new HttpError(409,'Platform not integrated',{code:'not_integrated'});};
 return{capabilities:async()=>capabilities.map(capability=>({capability,available:false,reason:'not_integrated',verifiedAt:null})),list:unavailable,detail:unavailable,reply:unavailable,normalizeVerifiedEvent:unavailable};
}
