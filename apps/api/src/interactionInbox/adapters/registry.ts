import type {InboxAdapter} from '../types';import {createDisabledAdapter} from './disabled';
export function createInboxRegistry(facebook:InboxAdapter,instagram?:InboxAdapter){const disabled=createDisabledAdapter();return{getInboxAdapter:(platform:string):InboxAdapter=>platform==='facebook'?facebook:platform==='instagram'&&instagram?instagram:disabled};}
export type InboxRegistry=ReturnType<typeof createInboxRegistry>;
