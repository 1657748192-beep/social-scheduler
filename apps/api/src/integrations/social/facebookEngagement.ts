import { randomUUID } from 'node:crypto';
import type { CapabilityState, FacebookCapabilities, FacebookComment, FacebookConversation, FacebookMessage, FacebookPage, FacebookSendResult } from './facebookEngagementTypes';

export type FacebookFailureKind = 'permission_missing' | 'authorization_invalid' | 'task_missing' | 'access_level' | 'rate_limited' | 'temporary_failure' | 'invalid_response';
export class FacebookEngagementError extends Error {
  constructor(public readonly kind: FacebookFailureKind, public readonly diagnosticId = randomUUID()) {
    super(`Facebook ${kind} (${diagnosticId}).`);
    this.name = 'FacebookEngagementError';
  }
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : {};
function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new FacebookEngagementError('invalid_response');
  return value;
}
function id(value: string): string {
  if (!/^[a-zA-Z0-9_.:-]{1,256}$/.test(value)) throw new Error('Invalid Facebook identifier.');
  return encodeURIComponent(value);
}
function timestamp(value: unknown): string {
  const raw = requiredString(value);
  if (!Number.isFinite(Date.parse(raw))) throw new FacebookEngagementError('invalid_response');
  return new Date(raw).toISOString();
}
function page<T>(value: RecordValue, map: (value: RecordValue) => T): FacebookPage<T> {
  if (!Array.isArray(value.data)) throw new FacebookEngagementError('invalid_response');
  const paging = record(value.paging), cursors = record(paging.cursors);
  return { items: value.data.map(item => map(record(item))), nextCursor: typeof paging.next === 'string' && typeof cursors.after === 'string' ? cursors.after : null };
}
function classify(status: number, code: unknown): FacebookFailureKind {
  if (code === 190) return 'authorization_invalid';
  if (status === 429 || [4,17,32,613].includes(Number(code))) return 'rate_limited';
  if (code === 10 || (typeof code === 'number' && code >= 200 && code < 300)) return 'permission_missing';
  return 'temporary_failure';
}

export function createFacebookEngagementClient(input: {
  pageId: string; accessToken: string; apiVersion: string; appId?: string; appSecret?: string; fetchImpl?: typeof fetch;
}) {
  id(input.pageId);
  if (!/^v\d+\.\d+$/.test(input.apiVersion)) throw new Error('Invalid Facebook Graph version.');
  const fetcher = input.fetchImpl ?? fetch;
  async function request(path: string, params: Record<string,string> = {}, method = 'GET', body?: string, appAuth = false): Promise<RecordValue> {
    const url = new URL(`https://graph.facebook.com/${input.apiVersion}/${path}`);
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
    let response: Response;
    try {
      response = await fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${appAuth ? `${input.appId}|${input.appSecret}` : input.accessToken}`,
          ...(body ? {'Content-Type': path.endsWith('/messages') ? 'application/json' : 'application/x-www-form-urlencoded'} : {}) }, body });
    } catch { throw new FacebookEngagementError('temporary_failure'); }
    const payload = record(await response.json().catch(() => null));
    if (!response.ok || payload.error) {
      const error = record(payload.error);
      // Never copy Meta's message: it can contain credentials or customer content.
      throw new FacebookEngagementError(classify(response.status,error.code));
    }
    if (!Object.keys(payload).length) throw new FacebookEngagementError('invalid_response');
    return payload;
  }
  function comment(raw: RecordValue, postId: string): FacebookComment {
    const sender = record(raw.from);
    return {id:requiredString(raw.id),postId,text:typeof raw.message === 'string' ? raw.message : '',
      senderId:typeof sender.id === 'string' ? sender.id : undefined,senderName:typeof sender.name === 'string' ? sender.name : undefined,timestamp:timestamp(raw.created_time)};
  }
  function conversation(raw: RecordValue): FacebookConversation {
    const people=record(raw.participants).data;
    if (!Array.isArray(people) || people.length !== 2 || !people.some(p => record(p).id === input.pageId)) throw new FacebookEngagementError('invalid_response');
    const other=record(people.find(p => record(p).id !== input.pageId));
    return {id:requiredString(raw.id),counterpartyId:requiredString(other.id),counterpartyName:typeof other.name === 'string' ? other.name : undefined,updatedAt:timestamp(raw.updated_time)};
  }
  async function send(path: string, body: string, responseField: 'id' | 'message_id'): Promise<FacebookSendResult> {
    try {
      const result = await request(path,{},'POST',body);
      const providerId = requiredString(result[responseField]);
      return {status:'sent',providerId};
    } catch (error) {
      if (error instanceof FacebookEngagementError && ['temporary_failure','invalid_response'].includes(error.kind)) return {status:'unknown',diagnosticId:error.diagnosticId};
      throw error;
    }
  }
  const capabilitiesUnknown = (reason: string): FacebookCapabilities => Object.fromEntries(
    ['readComments','replyComments','readMessages','replyMessages','subscription'].map(key => [key,{status:'unknown',reason}])
  ) as FacebookCapabilities;
  return {
    async inspectCapabilities(): Promise<FacebookCapabilities> {
      if (!input.appId || !input.appSecret) return capabilitiesUnknown('App authorization inspection is not configured.');
      try {
        const data=record((await request('debug_token',{input_token:input.accessToken},'GET',undefined,true)).data);
        if (data.is_valid === false) throw new FacebookEngagementError('authorization_invalid');
        if (data.is_valid !== true || !Array.isArray(data.scopes)) throw new FacebookEngagementError('invalid_response');
        if (data.app_id !== input.appId || data.type !== 'PAGE' || (data.profile_id && data.profile_id !== input.pageId)) throw new FacebookEngagementError('authorization_invalid');
        const identity=await request('me',{fields:'id'});
        if (identity.id !== input.pageId) throw new FacebookEngagementError('authorization_invalid');
        const grants=Array.isArray(data.granular_scopes) ? data.granular_scopes.map(record) : [];
        const state=(scopes: string[]): CapabilityState => scopes.every(scope => data.scopes instanceof Array && data.scopes.includes(scope) && !grants.some(g =>
          g.scope === scope && Array.isArray(g.target_ids) && g.target_ids.length > 0 && !g.target_ids.includes(input.pageId)))
          ? {status:'available'} : {status:'missing',reason:'Required Page permissions have not been granted.'};
        // Granted scopes are only a prerequisite; API calls remain authoritative for task/access-level restrictions.
        return {readComments:state(['pages_read_engagement','pages_read_user_content']),replyComments:state(['pages_read_user_content','pages_manage_engagement']),
          readMessages:state(['pages_read_engagement','pages_manage_metadata','pages_messaging']),replyMessages:state(['pages_messaging']),subscription:state(['pages_manage_metadata'])};
      } catch (error) {
        if (error instanceof FacebookEngagementError && error.kind === 'authorization_invalid') throw error;
        return capabilitiesUnknown('Unable to verify Page permissions with Meta.');
      }
    },
    async listComments(postId: string, after?: string): Promise<FacebookPage<FacebookComment>> {
      return page(await request(`${id(postId)}/comments`,{fields:'id,message,created_time,from',filter:'stream',limit:'25',...(after ? {after} : {})}), raw => comment(raw,postId));
    },
    async getComment(commentId: string): Promise<FacebookComment> {
      const raw=await request(id(commentId),{fields:'id,message,created_time,from,object{id}'});
      if (raw.id !== commentId) throw new FacebookEngagementError('invalid_response');
      return comment(raw,requiredString(record(raw.object).id));
    },
    async replyComment(commentId: string,text: string): Promise<FacebookSendResult> {
      if (!text.trim() || text.length > 8000) throw new Error('Comment text must contain 1–8000 characters.');
      return send(`${id(commentId)}/comments`,new URLSearchParams({message:text}).toString(),'id');
    },
    async listConversations(after?: string): Promise<FacebookPage<FacebookConversation>> {
      return page(await request(`${id(input.pageId)}/conversations`,{fields:'id,updated_time,participants',platform:'messenger',limit:'25',...(after ? {after} : {})}),conversation);
    },
    async getConversation(conversationId: string): Promise<FacebookConversation> {
      const raw=await request(id(conversationId),{fields:'id,updated_time,participants'});
      if (raw.id !== conversationId) throw new FacebookEngagementError('invalid_response');
      return conversation(raw);
    },
    async listMessages(conversationId: string,after?: string): Promise<FacebookPage<FacebookMessage>> {
      return page(await request(`${id(conversationId)}/messages`,{fields:'id,message,created_time,from,to',limit:'25',...(after ? {after} : {})}),raw => {
        const senderId=requiredString(record(raw.from).id), recipients=record(raw.to).data;
        if (!Array.isArray(recipients) || recipients.length !== 1) throw new FacebookEngagementError('invalid_response');
        const recipientId=requiredString(record(recipients[0]).id);
        if ((senderId !== input.pageId && recipientId !== input.pageId) || senderId === recipientId) throw new FacebookEngagementError('invalid_response');
        return {id:requiredString(raw.id),conversationId,senderId,recipientId,text:typeof raw.message === 'string' ? raw.message : '',timestamp:timestamp(raw.created_time),inbound:recipientId === input.pageId};
      });
    },
    async sendMessage(counterpartyId: string,text: string): Promise<FacebookSendResult> {
      id(counterpartyId);
      if (counterpartyId === input.pageId || !text.trim() || text.length > 2000) throw new Error('Message text must contain 1–2000 characters and target a customer.');
      return send(`${id(input.pageId)}/messages`,JSON.stringify({recipient:{id:counterpartyId},messaging_type:'RESPONSE',message:{text}}),'message_id');
    },
    async getSubscription(): Promise<CapabilityState> {
      if (!input.appId) return {status:'unknown',reason:'App identity is not configured.'};
      const raw=await request(`${id(input.pageId)}/subscribed_apps`,{fields:'id,subscribed_fields'});
      if (!Array.isArray(raw.data)) throw new FacebookEngagementError('invalid_response');
      const app=record(raw.data.find(item => record(item).id === input.appId));
      const fields=app.subscribed_fields;
      return Array.isArray(fields) && ['feed','messages'].every(field => fields.includes(field)) ? {status:'available'} : {status:'missing',reason:'Page comment/message subscriptions are incomplete.'};
    },
    async getSubscribedFields(): Promise<string[]> {
      if(!input.appId)throw new FacebookEngagementError('invalid_response');
      const raw=await request(`${id(input.pageId)}/subscribed_apps`,{fields:'id,subscribed_fields'});
      if(!Array.isArray(raw.data))throw new FacebookEngagementError('invalid_response');
      const app=raw.data.find(item=>record(item).id===input.appId);
      if(!app)return [];
      const fields=record(app).subscribed_fields;
      if(!Array.isArray(fields) || !fields.every(field=>typeof field==='string'))throw new FacebookEngagementError('invalid_response');
      return fields as string[];
    },
    async subscribe(fields:string[]=['feed','messages']): Promise<boolean> {
      if(!fields.length || !fields.every(field=>/^[a-z_]{1,100}$/.test(field)))throw new Error('Invalid Page subscription fields.');
      const raw=await request(`${id(input.pageId)}/subscribed_apps`,{},'POST',new URLSearchParams({subscribed_fields:[...new Set(fields)].join(',')}).toString());
      if (raw.success !== true) throw new FacebookEngagementError('invalid_response');
      return true;
    },
    async unsubscribe(): Promise<boolean> {
      const raw=await request(`${id(input.pageId)}/subscribed_apps`,{},'DELETE');
      if (raw.success !== true) throw new FacebookEngagementError('invalid_response');
      return true;
    }
  };
}
export type FacebookEngagementClient = ReturnType<typeof createFacebookEngagementClient>;
