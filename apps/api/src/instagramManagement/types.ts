export type InstagramManagementConfig={enabled:boolean;appId:string;appSecret:string;graphVersion:string;callbackUrl:string;requiredScopes:string[]};
export type InstagramManagementGrant={appId:string;providerAccountId:string;providerUserId:string;accessToken:string;scopes:string[];expiresAt:Date;displayName?:string};
export type InstagramGrantInspection={appId:string;providerAccountId:string;scopes:string[];expiresAt:Date};
