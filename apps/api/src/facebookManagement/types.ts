export type ManagementContext = {userId:string;workspaceId:string;sessionId:string};
export type PageContext = ManagementContext & {managedPageId:string};
export type ManagedPageDto = {
  id:string;connectionId:string;pageId:string;name:string;
  avatarUrl:string|null;profileUrl:string|null;
  businesses:Array<{id:string;name:string;relation:'owned'|'client'}>;
  publishingAccountId:string|null;
  authorization:'available'|'missing'|'expired'|'unknown';
  lastReadAt:string|null;
};
export type ReadPage<T> = {
  items:T[];nextCursor:string|null;readAt:string;
  source:'graph'|'received'|'mixed';stale:boolean;
  warnings:Array<{code:string;diagnosticId:string}>;
};
export type SendOutcome =
  | {status:'sent';providerId:string}
  | {status:'unknown';diagnosticId:string}
  | {status:'failed';code:string;diagnosticId:string};
