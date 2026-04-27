import express, { Router } from "express";
import { isPaidTankSku, isTankSku } from "@artillery/shared";
import { db, schema } from "../db/index.js";
import { logger } from "../logger.js";
import { asyncHandler } from "../middleware/error.js";
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

/**
 * Xsolla expects error responses to follow this exact shape (per
 * https://developers.xsolla.com/webhooks/integration/errors/):
 *
 *   HTTP/1.1 400 Bad Request
 *   { "error": { "code": "INVALID_USER", "message": "..." } }
 *
 * Returning anything else — even a different 4xx with a different body —
 * trips Xsolla's "test response to invalid signature" check and downstream
 * webhooks (user_validation, payment) silently get blocked.
 */
type XsollaErrorCode =
  | "INVALID_USER"
  | "INVALID_PARAMETER"
  | "INVALID_SIGNATURE"
  | "INCORRECT_AMOUNT"
  | "INCORRECT_INVOICE";

function xsollaError(
  res: express.Response,
  code: XsollaErrorCode,
  message: string,
): void {
  res.status(400).json({ error: { code, message } });
}

webhooksRouter.post(
  "/xsolla",
  asyncHandler(async (req, res) => {
    const raw = (req.body as Buffer | undefined)?.toString("utf8") ?? "";
    if (!verifyXsollaSignature(raw, req.header("authorization"))) {
      xsollaError(res, "INVALID_SIGNATURE", "Invalid signature");
      return;
    }

    let body: XsollaWebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      xsollaError(res, "INVALID_PARAMETER", "Invalid JSON body");
      return;
    }

    // user_validation is sent at multiple stages of the payment process to
    // check whether the user_id we passed in the token still represents a
    // real user. We trust the token (we minted it server-side for an
    // already-authenticated session) so any well-formed user_id passes.
    if (body.notification_type === "user_validation") {
      res.status(200).json({ status: "ok" });
      return;
    }

    if (body.notification_type !== "payment") {
      // Other notification types (refund, etc.) — ack so Xsolla doesn't
      // retry, but no work to do.
      res.status(200).json({ status: "ok" });
      return;
    }

    const userId = body.user?.id;
    const sku = body.custom_parameters?.sku;
    const externalId =
      body.transaction?.external_id ??
      (body.transaction?.id != null ? String(body.transaction.id) : "");
    if (!userId) {
      xsollaError(res, "INVALID_USER", "Missing user.id");
      return;
    }
    if (!sku || !isTankSku(sku) || !isPaidTankSku(sku)) {
      xsollaError(res, "INVALID_PARAMETER", "Unknown or non-paid sku");
      return;
    }
    if (!externalId) {
      xsollaError(res, "INVALID_PARAMETER", "Missing transaction id");
      return;
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
      res.status(200).json({ status: "ok", duplicate: true });
      return;
    }

    await grantEntitlement(userId, sku, "xsolla", externalId);
    logger.info({ userId, sku, externalId }, "entitlement granted");
    res.status(200).json({ status: "ok" });
  }),
);
