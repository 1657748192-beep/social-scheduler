export type SyncContext={userId:string;sessionId:string;workspaceId:string};
export type PageCandidate={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;existing:boolean;eligible:boolean;reason?:'permission_missing'|'authorization_invalid'};
export type VerifiedPage={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;pageToken:string;scopes:string[];expiresAt:Date|null};
export type SyncResult={createdPageIds:string[];skippedPageIds:string[]};
export type SyncView={syncId:string;workspaceId:string;expiresAt:string;status:'ready'|'importing'|'completed';pages:PageCandidate[];result?:SyncResult};
export type StoredSync={context:SyncContext;syncId:string;expiresAt:number;status:'ready'|'importing'|'completed';pages:VerifiedPage[];rejected:PageCandidate[];selectionHash?:string;leaseId?:string;result?:SyncResult};
