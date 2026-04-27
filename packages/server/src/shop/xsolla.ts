import crypto from "crypto";
import { tankBySku } from "@artillery/shared";
import { config } from "../config.js";

export interface CheckoutSession {
  url: string;
  externalId: string;
}

/**
 * Create an Xsolla Pay Station token + redirect URL for a bundle.
 *
 * In dev mode (SHOP_DEV_MODE=true) returns a synthetic URL that points at
 * /api/shop/dev-grant?sku=... so local devs can simulate a successful
 * purchase without a real Xsolla account.
 */
export async function createCheckout(
  userId: string,
  username: string,
  sku: string,
): Promise<CheckoutSession> {
  const tank = tankBySku(sku);
  if (!tank || tank.priceCents === 0) throw new Error(`unknown or free sku: ${sku}`);

  if (config.SHOP_DEV_MODE) {
    const externalId = `dev_${crypto.randomBytes(8).toString("hex")}`;
    const params = new URLSearchParams({ sku, externalId });
    return {
      url: `${config.PUBLIC_ORIGIN}/api/shop/dev-grant?${params.toString()}`,
      externalId,
    };
  }

  if (!config.XSOLLA_MERCHANT_ID || !config.XSOLLA_PROJECT_ID || !config.XSOLLA_API_KEY) {
    throw new Error("xsolla not configured");
  }

  const externalId = crypto.randomBytes(16).toString("hex");
  const body = {
    user: {
      id: { value: userId },
      name: { value: username },
    },
    settings: {
      project_id: Number(config.XSOLLA_PROJECT_ID),
      external_id: externalId,
      mode: config.XSOLLA_SANDBOX ? "sandbox" : undefined,
      currency: "USD",
      return_url: `${config.PUBLIC_ORIGIN}/#/customize?purchase=success`,
    },
    // Reference the catalog item by SKU so Pay Station can render the
    // cart properly. The matching item must exist in
    // Publisher Account → Items catalog → Virtual items with the same
    // SKU and a USD price configured. Pay Station ignores any amount we
    // pass here; it pulls price from the catalog entry.
    purchase: {
      virtual_items: {
        items: [{ sku, amount: 1 }],
      },
    },
    custom_parameters: { sku },
  };

  const credentials = Buffer.from(
    `${config.XSOLLA_MERCHANT_ID}:${config.XSOLLA_API_KEY}`,
  ).toString("base64");

  const res = await fetch(
    `https://api.xsolla.com/merchant/v2/merchants/${config.XSOLLA_MERCHANT_ID}/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`xsolla token request failed: ${res.status}`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("xsolla token missing");
  const base = config.XSOLLA_SANDBOX
    ? "https://sandbox-secure.xsolla.com/paystation4/"
    : "https://secure.xsolla.com/paystation4/";
  return { url: `${base}?token=${json.token}`, externalId };
}

/**
 * Xsolla signs webhook payloads as `Authorization: Signature <sha1>`,
 * where sha1 = SHA1(body + secret_key). Constant-time compare.
 */
export function verifyXsollaSignature(rawBody: string, header: string | undefined): boolean {
  if (config.SHOP_DEV_MODE) return true;
  if (!config.XSOLLA_WEBHOOK_SECRET || !header) return false;
  const expected = crypto
    .createHash("sha1")
    .update(rawBody + config.XSOLLA_WEBHOOK_SECRET)
    .digest("hex");
  const presented = header.replace(/^Signature\s+/i, "").trim();
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(presented, "utf8"),
  );
}

export interface XsollaWebhookBody {
  notification_type?: string;
  user?: { id?: string };
  transaction?: { id?: number; external_id?: string; payment_date?: string };
  purchase?: { checkout?: { amount?: number; currency?: string } };
  custom_parameters?: { sku?: string };
}
