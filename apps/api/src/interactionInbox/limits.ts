import {z} from 'zod';
import type {Query} from './types';
export const inboxLimits={accounts:50,page:25,maxPage:50,tags:10,workspaceTags:200,noteLength:2000,notes:100,searchPerMinute:30,refreshSeconds:30,batch:50} as const;
export const uuid=z.string().uuid();
export const kind=z.enum(['comments','messages','mentions']);
const schema=z.object({accountIds:z.array(uuid).min(1).max(50),kind,status:z.enum(['pending','in_progress','resolved']).optional(),unread:z.boolean().optional(),tagIds:z.array(uuid).max(10).optional(),from:z.string().datetime().optional(),to:z.string().datetime().optional(),q:z.string().trim().min(2).max(100).optional(),searchMessages:z.boolean().default(false),cursor:z.string().min(1).max(2048).optional(),limit:z.number().int().min(1).max(50).default(25)}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,'Invalid time range');
export function parseQuery(input:unknown):Query{return schema.parse(input);}
