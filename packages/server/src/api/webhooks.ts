import express, { Router } from "express";
import { isPaidTankSku } from "@artillery/shared";
import { db, schema } from "../db/index.js";
import { logger } from "../logger.js";
import { asyncHandler, HttpError } from "../middleware/error.js";
import { grantEntitlement } from "../shop/service.js";
import {
  type XsollaWebhookBody,
  verifyXsollaSignature,
} from "../shop/xsolla.js";

export const webhooksRouter = Router();

// Xsolla posts JSON; we capture the raw body so we can recompute the
// SHA1 signature without reformatting whitespace. Mount this router
// BEFORE express.json() in index.ts.
webhooksRouter.use(express.raw({ type: "application/json", limit: "64kb" }));

webhooksRouter.post(
  "/xsolla",
  asyncHandler(async (req, res) => {
    const raw = (req.body as Buffer | undefined)?.toString("utf8") ?? "";
    if (!verifyXsollaSignature(raw, req.header("authorization"))) {
      throw new HttpError(401, "bad signature", "bad_signature");
    }

    let body: XsollaWebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "invalid json", "bad_request");
    }

    // Xsolla pings several event types; we only care about confirmed payments.
    if (body.notification_type !== "payment") {
      res.json({ ok: true, ignored: body.notification_type });
      return;
    }

    const userId = body.user?.id;
    const sku = body.custom_parameters?.sku;
    const externalId =
      body.transaction?.external_id ??
      (body.transaction?.id != null ? String(body.transaction.id) : "");
    if (!userId || !sku || !isPaidTankSku(sku) || !externalId) {
      throw new HttpError(400, "missing fields", "bad_request");
    }

    // Idempotency: insert the purchase event keyed on (provider, externalId).
    // Conflict means we already processed this notification, so skip the grant.
    const inserted = await db
      .insert(schema.purchaseEvents)
      .values({
        provider: "xsolla",
        externalId,
        userId,
        sku,
        amountCents: Math.round((body.purchase?.checkout?.amount ?? 0) * 100),
        currency: body.purchase?.checkout?.currency ?? "USD",
        rawPayload: body as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({
        target: [
          schema.purchaseEvents.provider,
          schema.purchaseEvents.externalId,
        ],
      })
      .returning({ id: schema.purchaseEvents.id });

    if (inserted.length === 0) {
      logger.info({ externalId }, "duplicate xsolla notification");
      res.json({ ok: true, duplicate: true });
      return;
    }

    await grantEntitlement(userId, sku, "xsolla", externalId);
    logger.info({ userId, sku, externalId }, "entitlement granted");
    res.json({ ok: true });
  }),
);
