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

/** These server-only values must never be serialized as directory DTOs. */
export type DirectoryBusiness = {id:string;name:string};
export type DirectoryPage = {id:string;name:string;profileUrl:string|null;avatarUrl:string|null};
export type DirectoryUserPage = DirectoryPage & {pageToken:string|null;tasks:string[]};
export type DirectorySlice<T> = {items:T[];nextCursor:string|null};
export type PageTokenInspection = {
  pageId:string;scopes:string[];
  granularScopes:Array<{scope:string;targetIds:string[]|null}>;
  expiresAt:string|null;
};
