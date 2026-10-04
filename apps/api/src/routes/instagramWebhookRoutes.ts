import express, { Router } from "express";
import { createInstagramWebhookController, type InstagramWebhookControllerOptions } from "../controllers/instagramWebhookController";

export type { InstagramWebhookEvent } from "../services/instagramWebhookService";

export function createInstagramWebhookRouter(options: InstagramWebhookControllerOptions) {
  const router = Router();
  const controller = createInstagramWebhookController(options);
  router.get("/", controller.verify);
  router.post("/", express.raw({ type: "application/json", limit: "1mb" }), controller.receive);
  return router;
}
