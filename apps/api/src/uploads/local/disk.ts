import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, statfs, unlink,writeFile,rename,readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from '../../utils/errors';
import { PART_SIZE_BYTES } from './protocol';

export type StoredPart = { storageKey: string; sizeBytes: number; sha256: string };
export type LocalUploadDisk = {
  receive(sessionId: string, index: number, source: Readable, expectedBytes: number, sha256: string, signal: AbortSignal): Promise<StoredPart>;
  removeOwned(keys: string[]): Promise<void>;
  availableBytes(): Promise<bigint>;
  assemble(sessionId:string,attemptId:string,parts:StoredPart[],signal:AbortSignal,mimeType?:string):Promise<{storageKey:string;sizeBytes:number}>;
  hasFile(storageKey:string,sizeBytes:number):Promise<boolean>;
  assembleThumbnail(sessionId:string,attemptId:string,key:string,sizeBytes:number,signal:AbortSignal):Promise<{storageKey:string;sizeBytes:number}>;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PRIVATE = '.upload-sessions';
const outputPattern=/^local-upload-([a-f0-9-]{36})-([a-f0-9-]{36})\.(mp4|webm|mov|mpeg|ogg|avi|bin|jpg)$/;
export function assemblyKey(sid:string,attempt:string,mimeType='video/mp4'){
  if(!UUID.test(sid)||!UUID.test(attempt))throw new HttpError(400,'Invalid assembly identifier');
  const extension:Record<string,string>={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/mpeg':'mpeg','video/ogg':'ogg','video/x-msvideo':'avi','image/jpeg':'jpg'};
  return `local-upload-${sid}-${attempt}.${extension[mimeType]??'bin'}`;
}

export function createLocalUploadDisk(root: string): LocalUploadDisk {
  root = path.resolve(root);
  async function directory(target: string, create: boolean) {
    if (create) await mkdir(target, {mode: 0o700}).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new HttpError(400, 'Unsafe upload directory');
  }
  async function sessionDirectory(sid: string, create: boolean) {
    if (!UUID.test(sid)) throw new HttpError(400, 'Invalid upload session');
    await directory(root, false);
    await directory(path.join(root, PRIVATE), create);
    const dir = path.join(root, PRIVATE, sid);
    await directory(dir, create);
    return dir;
  }
  function parseKey(key: string) {
    const final=outputPattern.exec(key);
    if(final&&UUID.test(final[1])&&UUID.test(final[2]))return [key];
    const segments = key.split('/');
    if (segments.length !== 3 || segments[0] !== PRIVATE || !UUID.test(segments[1]) ||
        !/\.(part|merge|receipt)$/.test(segments[2]) || !UUID.test(segments[2].replace(/\.[^.]+$/,''))) {
      throw new HttpError(400, 'Invalid private upload key');
    }
    return segments;
  }
  async function ownedPath(key:string){
    const parsed=parseKey(key);
    if(parsed.length===1){await directory(root,false);return path.join(root,key);}
    return path.join(await sessionDirectory(parsed[1],false),parsed[2]);
  }
  return {
    async assembleThumbnail(sid,attempt,key,sizeBytes,signal){
      if(sizeBytes<5||sizeBytes>102400||!key.startsWith(`${PRIVATE}/${sid}/`))throw new HttpError(400,'Invalid thumbnail');
      if(!await this.hasFile(key,sizeBytes))throw new HttpError(400,'Thumbnail unavailable');
      const bytes=await readFile(await ownedPath(key));
      if(bytes.length!==sizeBytes||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new HttpError(400,'Invalid thumbnail');
      return this.assemble(sid,attempt,[{storageKey:key,sizeBytes,sha256:createHash('sha256').update(bytes).digest('hex')}],signal,'image/jpeg');
    },
    async hasFile(key,sizeBytes){
      try{const stat=await lstat(await ownedPath(key));return stat.isFile()&&!stat.isSymbolicLink()&&stat.size===sizeBytes;}
      catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
    },
    async assemble(sid,attempt,parts,signal,mimeType){
      if(!parts.length)throw new HttpError(409,'Upload has no blocks');
      const storageKey=assemblyKey(sid,attempt,mimeType),dir=await sessionDirectory(sid,true);
      const temporary=path.join(dir,`${attempt}.merge`),target=path.join(root,storageKey);
      // The durable receipt proves this attempt owns its public output after a
      // crash between rename and DB commit. Never overwrite another receipt.
      await writeFile(path.join(dir,`${attempt}.receipt`),storageKey,{flag:'wx',mode:0o600});
      let sizeBytes=0,owned=false,moved=false;
      async function* verifiedParts(){
        for(const part of parts){
          signal.throwIfAborted();
          if(!part.storageKey.startsWith(`${PRIVATE}/${sid}/`))throw new HttpError(400,'Block belongs to another session');
          const sourcePath=await ownedPath(part.storageKey),stat=await lstat(sourcePath);
          if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==part.sizeBytes)throw new HttpError(400,'Upload block is unavailable');
          const hash=createHash('sha256');let count=0;
          for await(const buffer of createReadStream(sourcePath)){
            signal.throwIfAborted();count+=buffer.length;
            if(count>part.sizeBytes)throw new HttpError(400,'Upload block size changed');
            hash.update(buffer);sizeBytes+=buffer.length;yield buffer;
          }
          if(count!==part.sizeBytes||hash.digest('hex')!==part.sha256)throw new HttpError(400,'Upload block checksum changed');
        }
      }
      const output=createWriteStream(temporary,{flags:'wx',mode:0o600});output.once('open',()=>{owned=true;});
      try{
        await pipeline(Readable.from(verifiedParts()),output,{signal});signal.throwIfAborted();
        await rename(temporary,target);moved=true;
        return {storageKey,sizeBytes};
      }catch(e){
        if(owned)await unlink(moved?target:temporary).catch(err=>{if(err.code!=='ENOENT')throw err;});
        throw e;
      }
    },
    async availableBytes() {
      await directory(root, false);
      const stat = await statfs(root, {bigint: true});
      return stat.bavail * stat.bsize;
    },
    async removeOwned(keys) {
      keys.forEach(parseKey);
      for (const key of keys) {
        try {
          const target = await ownedPath(key);
          const stat = await lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new HttpError(400, 'Unsafe upload file');
          await unlink(target);
        } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      }
    },
    async receive(sid, index, source, expectedBytes, sha256, signal) {
      if (!Number.isSafeInteger(index) || index < 0 || index > 249 ||
          !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > PART_SIZE_BYTES ||
          !/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(400, 'Invalid upload block');
      signal.throwIfAborted();
      const dir = await sessionDirectory(sid, true);
      if (source.destroyed && !source.readableEnded) throw new Error('Upload stream interrupted');
      const filename = `${randomUUID()}.part`, target = path.join(dir, filename);
      const storageKey = `${PRIVATE}/${sid}/${filename}`;
      let sizeBytes = 0, owned = false;
      const hash = createHash('sha256');
      const verify = new Transform({ transform(chunk, _encoding, done) {
        sizeBytes += chunk.length;
        if (sizeBytes > expectedBytes) return done(new HttpError(413, 'Upload block exceeds declared length'));
        hash.update(chunk); done(null, chunk);
      }});
      const output = createWriteStream(target, {flags: 'wx', mode:0o600});
      output.once('open', () => { owned = true; });
      const fail = (e: Error) => verify.destroy(e);
      const closed = () => { if (!source.readableEnded) fail(new Error('Upload stream interrupted')); };
      source.on('error', fail); source.on('close', closed);
      try {
        // Do not put an HTTP IncomingMessage in pipeline: validation must not destroy
        // the socket before the route can send its 400/413 response.
        const transfer = pipeline(verify, output, {signal});
        source.pipe(verify);
        await transfer;
        if (sizeBytes !== expectedBytes || hash.digest('hex') !== sha256) throw new HttpError(400, 'Upload block verification failed');
        return {storageKey, sizeBytes, sha256};
      } catch (e) {
        if (owned) await unlink(target).catch(err => { if (err.code !== 'ENOENT') throw err; });
        if ((e as NodeJS.ErrnoException).code === 'ENOSPC') throw new HttpError(507, 'Upload storage is full');
        throw e;
      } finally {
        source.unpipe(verify); source.off('error', fail); source.off('close', closed);
      }
    }
  };
}
