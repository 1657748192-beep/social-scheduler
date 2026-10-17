import {apiRequest} from './api';
export type FacebookSyncPage={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;existing:boolean;eligible:boolean;reason?:string};
export type FacebookSyncResult={createdPageIds:string[];skippedPageIds:string[]};
export type FacebookSyncView={syncId:string;workspaceId:string;expiresAt:string;status:'ready'|'importing'|'completed';pages:FacebookSyncPage[];result?:FacebookSyncResult;selectedPageIds?:string[]};
export function facebookPageSyncRequest<T>(token:string,workspaceId:string,path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}){return apiRequest<T>(`/workspaces/${encodeURIComponent(workspaceId)}/facebook-page-sync${path}`,{token,...options});}

type NavigationBrowser=Pick<Window,'location'|'history'>;
const navigationKey='facebookPageSyncNavigation';
export function clearFacebookSyncNavigation(browser:NavigationBrowser=window){
 const state={...browser.history.state};delete state[navigationKey];browser.history.replaceState(state,'',browser.location.href);
}
export async function recoverFacebookSyncNavigation(token:string,browser:NavigationBrowser=window):Promise<{syncId:string;workspaceId:string}|null>{
 const url=new URL(browser.location.href),callback=url.searchParams.get('facebookPageSync'),saved=browser.history.state?.[navigationKey];
 if(!callback&&!saved)return null;
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 const candidate=callback?{syncId:callback,workspaceId:url.searchParams.get('syncWorkspace'),fingerprint}:saved;
 const valid=candidate&&typeof candidate.syncId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(candidate.syncId)&&typeof candidate.workspaceId==='string'&&candidate.workspaceId.length>0&&candidate.workspaceId.length<=256&&candidate.fingerprint===fingerprint;
 const state={...browser.history.state};delete state[navigationKey];if(valid)state[navigationKey]=candidate;
 url.searchParams.delete('facebookPageSync');url.searchParams.delete('syncWorkspace');browser.history.replaceState(state,'',url.pathname+url.search+url.hash);
 return valid?{syncId:candidate.syncId,workspaceId:candidate.workspaceId}:null;
}
