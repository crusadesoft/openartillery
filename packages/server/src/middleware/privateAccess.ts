import { BlockList, isIPv4 } from "net";
import type { Request, RequestHandler } from "express";

const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_NETWORKS.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_NETWORKS.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_NETWORKS.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_NETWORKS.addAddress("::1", "ipv6");
PRIVATE_NETWORKS.addSubnet("fc00::", 7, "ipv6");

export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  // Dual-stack sockets report IPv4 peers as ::ffff:a.b.c.d.
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  try {
    return isIPv4(v4)
      ? PRIVATE_NETWORKS.check(v4, "ipv4")
      : PRIVATE_NETWORKS.check(address, "ipv6");
  } catch {
    return false;
  }
}

// Headers that mean a proxy relayed the request. Cloudflare's edge always
// sets cf-connecting-ip and cf-ray, and clients can't strip them.
const PROXY_HEADERS = [
  "cf-connecting-ip",
  "cf-ray",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
];

/**
 * True for requests that reached the server directly from a loopback or
 * private address, e.g. curl on the VPS, an SSH tunnel to it, or another
 * container on the Docker network.
 *
 * The socket address alone can't tell those apart from public traffic in
 * production. The Cloudflare Tunnel connects from 127.0.0.1, and Docker's
 * port forwarding then presents it to the container as the bridge gateway
 * (172.x), so every public request looks private. Any proxy header
 * therefore disqualifies a request. req.ip is no help either: with
 * "trust proxy" it comes from X-Forwarded-For, which a direct caller can
 * set to anything.
 */
export function isDirectPrivateRequest(req: Request): boolean {
  if (PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) return false;
  return isPrivateAddress(req.socket.remoteAddress);
}

/**
 * Runs `handler` only for direct private requests. Everyone else carries on
 * down the stack as if it weren't mounted, so they get the ordinary 404.
 */
export function privateOnly(handler: RequestHandler): RequestHandler {
  return (req, res, next) =>
    isDirectPrivateRequest(req) ? handler(req, res, next) : next();
}
