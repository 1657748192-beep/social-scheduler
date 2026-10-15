import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, statfs, unlink } from 'node:fs/promises';
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
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PRIVATE = '.upload-sessions';

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
    const segments = key.split('/');
    if (segments.length !== 3 || segments[0] !== PRIVATE || !UUID.test(segments[1]) ||
        !segments[2].endsWith('.part') || !UUID.test(segments[2].slice(0,-5))) {
      throw new HttpError(400, 'Invalid private upload key');
    }
    return segments;
  }
  return {
    async availableBytes() {
      await directory(root, false);
      const stat = await statfs(root, {bigint: true});
      return stat.bavail * stat.bsize;
    },
    async removeOwned(keys) {
      const parsed = keys.map(parseKey);
      for (const [, sid, filename] of parsed) {
        try {
          const dir = await sessionDirectory(sid, false);
          const target = path.join(dir, filename);
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
