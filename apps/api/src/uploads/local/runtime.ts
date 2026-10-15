import {prisma} from '../../prisma';
import {redis} from '../../redis';
import {uploadRoot} from '../../middleware/upload';
import {createLocalUploadDisk} from './disk';
import {createUploadLeases} from './leases';
import type {ChunkDeps} from './parts';

// Same existing Redis service, with bounded commands and no offline queue.
export const localUploadRedis=redis.duplicate({maxRetriesPerRequest:0,enableOfflineQueue:false,commandTimeout:2000});
localUploadRedis.on('error',()=>{});
const disk=createLocalUploadDisk(uploadRoot);
export const localUploadRuntime:ChunkDeps={db:prisma,now:()=>new Date(),availableBytes:disk.availableBytes,disk,leases:createUploadLeases(localUploadRedis,'local-upload:v1')};
