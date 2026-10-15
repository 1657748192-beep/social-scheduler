import express from 'express';

/** One production wrapper used by createApp and HTTP boundary tests. */
export function createUploadStatic(root: string) {
  const router = express.Router();
  router.use((req, res, next) => {
    let decoded = req.path;
    // Reject residual encoding as well as decoded private segments; never let
    // a second decoding layer expose private files.
    try { decoded = decodeURIComponent(decoded); }
    catch { res.sendStatus(400); return; }
    if (decoded.includes('%') || decoded.split(/[\\/]/).some(segment => segment.toLowerCase() === '.upload-sessions')) {
      res.sendStatus(404); return;
    }
    next();
  });
  router.use(express.static(root));
  return router;
}
