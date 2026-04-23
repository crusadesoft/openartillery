import { Router } from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  type AuthTokens,
} from "@artillery/shared";
import { db, schema } from "../db/index.js";
import { validateBody, getValidated } from "../middleware/validate.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  hashRefreshToken,
  issueRefreshToken,
  signAccessToken,
} from "./jwt.js";
import { hashPassword, verifyPassword } from "./password.js";
import { config } from "../config.js";

export const authRouter = Router();

authRouter.use(authLimiter);

authRouter.post(
  "/register",
  validateBody(RegisterRequest),
  asyncHandler(async (req, res) => {
    const body = getValidated<z.infer<typeof RegisterRequest>>(req);
    const usernameLower = body.username.toLowerCase();
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.usernameLower, usernameLower),
    });
    if (existing) throw new HttpError(409, "username taken", "username_taken");

    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(schema.users)
      .values({ username: body.username, usernameLower, passwordHash })
      .returning();
    if (!user) throw new HttpError(500, "insert failed", "insert_failed");

    const tokens = await issueTokenPair(user.id, user.username);
    res.status(201).json({
      user: publicUser(user),
      tokens,
    });
  }),
);

authRouter.post(
  "/login",
  validateBody(LoginRequest),
  asyncHandler(async (req, res) => {
    const body = getValidated<z.infer<typeof LoginRequest>>(req);
    const user = await db.query.users.findFirst({
      where: eq(schema.users.usernameLower, body.username.toLowerCase()),
    });
    if (!user)
      throw new HttpError(401, "bad credentials", "invalid_credentials");
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "bad credentials", "invalid_credentials");

    const tokens = await issueTokenPair(user.id, user.username);
    res.json({ user: publicUser(user), tokens });
  }),
);

authRouter.post(
  "/refresh",
  validateBody(RefreshRequest),
  asyncHandler(async (req, res) => {
    const { refreshToken } = getValidated<z.infer<typeof RefreshRequest>>(req);
    const tokenHash = hashRefreshToken(refreshToken);
    const row = await db.query.refreshTokens.findFirst({
      where: and(
        eq(schema.refreshTokens.tokenHash, tokenHash),
        eq(schema.refreshTokens.revoked, false),
        gt(schema.refreshTokens.expiresAt, new Date()),
      ),
    });
    if (!row) throw new HttpError(401, "invalid refresh token", "invalid_refresh");
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, row.userId),
    });
    if (!user) throw new HttpError(401, "no user", "invalid_refresh");

    // Rotate: revoke the used token, issue a fresh pair.
    await db
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(eq(schema.refreshTokens.id, row.id));

    const tokens = await issueTokenPair(user.id, user.username);
    res.json({ user: publicUser(user), tokens });
  }),
);

authRouter.post(
  "/logout",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    await db
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(
        and(
          eq(schema.refreshTokens.userId, auth.userId),
          eq(schema.refreshTokens.revoked, false),
        ),
      );
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, auth.userId),
    });
    if (!user) throw new HttpError(404, "no user", "not_found");
    res.json({ user: publicUser(user) });
  }),
);

async function issueTokenPair(userId: string, username: string): Promise<AuthTokens> {
  const access = await signAccessToken({ sub: userId, username });
  const refresh = issueRefreshToken();
  await db.insert(schema.refreshTokens).values({
    userId,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
  });
  // Opportunistic cleanup of stale tokens for this user.
  await db
    .delete(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.userId, userId),
        sql`${schema.refreshTokens.expiresAt} < now()`,
      ),
    );
  return {
    accessToken: access,
    refreshToken: refresh.raw,
    expiresIn: config.ACCESS_TOKEN_TTL,
  };
}

function publicUser(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    mmr: u.mmr,
    wins: u.wins,
    losses: u.losses,
    kills: u.kills,
    deaths: u.deaths,
    matches: u.matches,
    createdAt: u.createdAt.toISOString(),
  };
}
