import type { Request, Response } from "express";
import {
  createInstagramWebhookProcessor,
  isInstagramWebhookVerifyTokenValid,
  isValidInstagramWebhookSignature,
  type InstagramWebhookEvent
} from "../services/instagramWebhookService";

export type InstagramWebhookControllerOptions = {
  verifyToken: string;
  appSecret: string;
  onEvent?: (event: InstagramWebhookEvent) => void | Promise<void>;
};

export function createInstagramWebhookController(options: InstagramWebhookControllerOptions) {
  const processPayload = createInstagramWebhookProcessor({ onEvent: options.onEvent });

  return {
    verify(req: Request, res: Response) {
      if (!options.verifyToken) {
        res.status(503).type("text/plain").send("Webhook verification is not configured.");
        return;
      }
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && typeof challenge === "string" && isInstagramWebhookVerifyTokenValid(
        typeof token === "string" ? token : undefined,
        options.verifyToken
      )) {
        res.status(200).type("text/plain").send(challenge);
        return;
      }
      res.status(403).type("text/plain").send("Webhook verification failed.");
    },

    async receive(req: Request, res: Response) {
      if (!options.appSecret) {
        res.status(503).json({ error: "Webhook signature verification is not configured." });
        return;
      }
      const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
      if (!rawBody) {
        res.status(400).json({ error: "Invalid webhook request." });
        return;
      }
      const signature = req.header("X-Hub-Signature-256");
      if (!isValidInstagramWebhookSignature(rawBody, signature, options.appSecret)) {
        res.status(403).json({ error: "Invalid webhook signature." });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        res.status(400).json({ error: "Invalid webhook request." });
        return;
      }
      try {
        res.status(200).json(await processPayload(payload));
      } catch {
        res.status(400).json({ error: "Invalid webhook request." });
      }
    }
  };
}
