import type {InboxDetail} from '../../../lib/interactionInbox';
type Item=InboxDetail['items'][number];
const stamp=(item:Item)=>{const at=Date.parse(item.occurredAt);return Number.isFinite(at)?at:Number.MAX_SAFE_INTEGER;};
export function chronologicalMessages(items:Item[]):Item[]{
 const unique=new Map(items.map(item=>[item.id,item]));
 return [...unique.values()].sort((a,b)=>stamp(a)-stamp(b)||(a.id<b.id?-1:a.id>b.id?1:0));
}
export function refreshMessageDetail(old:InboxDetail|null,fresh:InboxDetail):InboxDetail{
 if(fresh.kind!=='messages'||old?.id!==fresh.id||old.accountId!==fresh.accountId||old.kind!==fresh.kind)return fresh;
 const previous=chronologicalMessages(old.items),current=chronologicalMessages(fresh.items);
 // An empty authoritative window clears bodies. If a burst of new messages
 // breaks overlap, restart from the new page/cursor instead of hiding the gap.
 const ids=new Set(current.map(item=>item.id));
 if(!fresh.nextCursor||!current.length||!previous.some(item=>ids.has(item.id)))return {...fresh,items:current};
 const retainedHistory=previous.length>0&&current.length>0&&stamp(previous[0])<stamp(current[0]);
 return {...fresh,items:chronologicalMessages([...old.items,...fresh.items]),nextCursor:retainedHistory?old.nextCursor:fresh.nextCursor};
}
export function prependMessageHistory(current:InboxDetail,page:InboxDetail):InboxDetail{
 // An older page is context, not the authority for today's reply target/status.
 return {...current,items:chronologicalMessages([...page.items,...current.items]),nextCursor:page.nextCursor};
}
