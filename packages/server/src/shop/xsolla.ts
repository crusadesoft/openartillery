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
  // The In-Game Store v3 catalog endpoint expects items keyed by SKU +
  // quantity. Pay Station renders the cart from the catalog entries.
  // `sandbox` is a top-level boolean (not `settings.mode`); when true the
  // resulting token can only be opened via sandbox-secure.xsolla.com.
  const body = {
    user: {
      id: { value: userId },
      name: { value: username },
      country: { value: "US", allow_modify: true },
    },
    sandbox: config.XSOLLA_SANDBOX,
    settings: {
      external_id: externalId,
      currency: "USD",
      return_url: `${config.PUBLIC_ORIGIN}/#/customize?purchase=success`,
    },
    purchase: {
      items: [{ sku, quantity: 1 }],
    },
    custom_parameters: { sku },
  };

  const credentials = Buffer.from(
    `${config.XSOLLA_MERCHANT_ID}:${config.XSOLLA_API_KEY}`,
  ).toString("base64");

  const res = await fetch(
    `https://store.xsolla.com/api/v3/project/${config.XSOLLA_PROJECT_ID}/admin/payment/token`,
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
    const errBody = await res.text().catch(() => "");
    throw new Error(`xsolla token request failed: ${res.status} ${errBody.slice(0, 200)}`);
  }
  const json = (await res.json()) as { token?: string; order_id?: number };
  if (!json.token) throw new Error("xsolla token missing");
  // Sandbox tokens can only be opened on sandbox-secure.xsolla.com; live
  // tokens only work on secure.xsolla.com. The endpoint routes don't
  // accept a token from the wrong environment.
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
