export type FacebookCapabilityState={status:'available'|'missing'|'unknown';reason?:string};
export type FacebookCapabilities=Record<'readComments'|'replyComments'|'readMessages'|'replyMessages'|'subscription',FacebookCapabilityState>;
export type FacebookPage<T>={items:T[];nextCursor:string|null};
export type FacebookComment={id:string;postId:string;text:string;senderId?:string;senderName?:string;timestamp:string;deleted?:boolean};
export type FacebookConversation={id:string;counterpartyId:string;counterpartyName?:string;updatedAt:string};
export type FacebookMessage={id:string;conversationId:string;senderId:string;recipientId:string;text:string;timestamp:string;inbound:boolean};
export type FacebookSendResult={status:'sent';providerId:string}|{status:'unknown';diagnosticId:string};
type GuardResult<T>={current:true;value:T}|{current:false};
export function createFacebookRequestGuard(){
  let key='',generation=0,sending=false;const sequences=new Map<string,number>();
  return {
    reset(next:string){if(next!==key){key=next;generation++;sequences.clear();}},
    async run<T>(slot:string,request:()=>Promise<T>):Promise<GuardResult<T>>{
      const revision=generation,seq=(sequences.get(slot)??0)+1;sequences.set(slot,seq);
      const current=()=>revision===generation && sequences.get(slot)===seq;
      try{const value=await request();return current()?{current:true,value}:{current:false};}
      catch(error){if(!current())return {current:false};throw error;}
    },
    async send<T>(request:()=>Promise<T>):Promise<GuardResult<T>>{
      if(sending)return {current:false};sending=true;const revision=generation;
      try{const value=await request();return revision===generation?{current:true,value}:{current:false};}
      catch(error){if(revision!==generation)return {current:false};throw error;}
      finally{sending=false;}
    }
  };
}
export function facebookSendNotice(result:FacebookSendResult,locale:'zh-CN'|'en'){
  return result.status==='sent'?(locale==='en'?'Reply sent.':'回复已发送。'):(locale==='en'?'Send status is unknown. Verify in the official inbox before trying again.':'发送状态待核实，请先到官方收件箱确认，不要重复发送。');
}
export function facebookAccountPath(workspaceId:string,accountId:string){return `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/facebook`;}
