import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { removedMetaEngagement } from '../src/middleware/removedMetaEngagement';

test('retired comments, messages, authorization and callbacks cannot reach downstream handlers', async () => {
  const app = express();
  app.use(removedMetaEngagement);
  app.use((_req, res) => res.status(204).end());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const path of ['/api/v1/webhooks/instagram', '/api/v1/webhooks/facebook', '/api/v1/integrations/facebook-engagement/oauth/callback', '/api/v1/workspaces/w/social-accounts/a/instagram-engagement/oauth/start', '/api/v1/workspaces/w/instagram/posts/p/comments', '/api/v1/workspaces/w/social-accounts/a/facebook/conversations']) {
      assert.equal((await fetch(`http://127.0.0.1:${address.port}${path}`, {method:'POST'})).status, 410, path);
    }
    for (const path of ['/api/v1/workspaces/w/social-accounts', '/api/v1/integrations/instagram/oauth/start', '/api/v1/integrations/facebook/oauth/callback', '/api/v1/workspaces/w/schedules', '/api/v1/workspaces/w/facebook-management/pages', '/api/v1/integrations/facebook-management/oauth/callback']) {
      assert.equal((await fetch(`http://127.0.0.1:${address.port}${path}`)).status, 204, path);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
