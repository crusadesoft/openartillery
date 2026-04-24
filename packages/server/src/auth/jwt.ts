import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import { config } from "../config.js";

const accessKey = new TextEncoder().encode(config.JWT_ACCESS_SECRET);

export interface AccessClaims {
  sub: string; // user id
  username: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ username: claims.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL}s`)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessKey);
  if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
    throw new Error("invalid access token payload");
  }
  return { sub: payload.sub, username: payload.username };
}

/**
 * Refresh tokens are long random strings stored server-side as SHA-256
 * hashes. We return the raw token to the client; the hash is what lives in
 * the DB so a stolen DB row can't impersonate anyone.
 */
export function issueRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL * 1000);
  return { raw, hash, expiresAt };
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
