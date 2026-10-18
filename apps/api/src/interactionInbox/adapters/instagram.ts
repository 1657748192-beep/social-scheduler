import type {PrismaClient} from '@prisma/client';import type {InboxAdapter} from '../types';
import type {LiveInboxPolicy} from '../livePolicy';
import type {createInstagramManagementAccess} from '../../instagramManagement/access';
import type {InstagramManagementEngagement} from '../../instagramManagement/engagement';
export function createInstagramInboxAdapter({engagement}:{db:PrismaClient;access:ReturnType<typeof createInstagramManagementAccess>;engagement:InstagramManagementEngagement;policy:LiveInboxPolicy}):InboxAdapter&Pick<InstagramManagementEngagement,'pendingSend'>{return engagement;}
