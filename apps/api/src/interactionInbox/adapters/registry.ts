import type {InboxAdapter} from '../types';import {createDisabledAdapter} from './disabled';
export function createInboxRegistry(facebook:InboxAdapter){const disabled=createDisabledAdapter();return{getInboxAdapter:(platform:string):InboxAdapter=>platform==='facebook'?facebook:disabled};}
export type InboxRegistry=ReturnType<typeof createInboxRegistry>;
