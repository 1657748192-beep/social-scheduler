import type { RequestHandler } from 'express';

export const removedMetaEngagement: RequestHandler = (req, res, next) => {
  const path = req.path;
  const retired = /^\/api\/v1\/webhooks\/(instagram|facebook)(\/|$)/i.test(path)
    || /\/(instagram|facebook)-engagement(\/|$)/i.test(path)
    || /^\/api\/v1\/workspaces\/[^/]+\/social-accounts\/[^/]+\/(instagram|facebook)\/(reception|capabilities|conversations)(\/|$)/i.test(path)
    || /^\/api\/v1\/workspaces\/[^/]+\/(instagram|facebook)\/posts\/[^/]+\/comments(\/|$)/i.test(path);
  if (retired) { res.status(410).json({ message: 'Comments and inbox functionality has been removed.' }); return; }
  next();
};
