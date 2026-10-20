import {apiRequest} from './api';
import type {FacebookSyncPage,FacebookSyncResult} from './facebookPageSync';
export type PageImportSummary={id:string;workspaceId:string;note:string;status:string;createdAt:string;expiresAt:string;candidateExpiresAt:string|null;retentionExpiresAt:string|null;result:FacebookSyncResult|null};
export type PageImportView=PageImportSummary&{pages:FacebookSyncPage[];selectedPageIds?:string[]};
export function pageImportRequest<T>(token:string,workspaceId:string,path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}){return apiRequest<T>(`/workspaces/${encodeURIComponent(workspaceId)}/facebook-page-import-invitations${path}`,{token,cache:'no-store',...options});}
