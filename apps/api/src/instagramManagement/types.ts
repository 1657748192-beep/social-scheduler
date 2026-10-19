export type InstagramManagementConfig={enabled:boolean;appId:string;appSecret:string;graphVersion:string;callbackUrl:string;requiredScopes:string[]};
export type InstagramManagementGrant={appId:string;providerAccountId:string;providerUserId:string;accessToken:string;scopes:string[];expiresAt:Date;displayName?:string};
export type InstagramGrantInspection={appId:string;providerAccountId:string;scopes:string[];expiresAt:Date};
/** Server-owned OAuth provenance; never constructed from an HTTP request. */
export type InstagramInspectionContext={connection:{id:string;appId:string;providerAccountId:string;providerUserId:string;version:number;scopes:string[];expiresAt:Date|null;authorizedAt:Date|null;authorizationStartedAt:Date|null};capability:import('../interactionInbox/types').Capability};
export type InstagramGrantInspector=(accountId:string,token:string,context?:InstagramInspectionContext)=>Promise<InstagramGrantInspection>;
declare const verifiedInstagramEvent:unique symbol;
export type VerifiedInstagramEvent={accountId:string;field:'comments'|'messages';eventId:string;senderId?:string;recipientId?:string;mediaId?:string;text?:string;username?:string;timestamp:number;isEcho:boolean;deleted:boolean;readonly [verifiedInstagramEvent]:true};
export type InstagramEventClaim={id:string;workspaceId:string;connectionId:string;connectionVersion:number;claimToken:string;payload:unknown};
export type InstagramSourceSubject={workspaceId:string;platform:'instagram';appId:string;providerAssetId:string;actorId?:string;providerEventId:string;eventKind:'comments'|'messages';occurredAt:Date;connectionId:string;connectionVersion:number};
