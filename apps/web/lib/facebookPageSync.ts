import {apiRequest} from './api';
export type FacebookSyncPage={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;existing:boolean;eligible:boolean;reason?:string};
export type FacebookSyncResult={createdPageIds:string[];skippedPageIds:string[]};
export type FacebookSyncView={syncId:string;workspaceId:string;expiresAt:string;status:'ready'|'importing'|'completed';pages:FacebookSyncPage[];result?:FacebookSyncResult;selectedPageIds?:string[]};
export function facebookPageSyncRequest<T>(token:string,workspaceId:string,path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}){return apiRequest<T>(`/workspaces/${encodeURIComponent(workspaceId)}/facebook-page-sync${path}`,{token,...options});}
