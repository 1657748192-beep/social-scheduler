import { prisma } from '../prisma';
import { config } from '../config';
import { createFacebookReceptionStore } from './facebookReceptionStore';
export const facebookReceptionStore=createFacebookReceptionStore(prisma);
let running=false;
export async function processFacebookReceptionBatch(){
  if(!config.FACEBOOK_ENGAGEMENT_ENABLED || running)return;
  running=true;
  try{for(const row of await facebookReceptionStore.claimBatch(new Date(),50)){
    try{await facebookReceptionStore.processClaim(row,new Date());await facebookReceptionStore.finishClaim(row.id,row.claimToken);}
    catch{await facebookReceptionStore.failClaim(row.id,row.claimToken,'Processing failed');}
  }}finally{running=false;}
}
