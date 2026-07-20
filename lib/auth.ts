/**
 * Bearer token auth for /api/admin/* routes.
 * The token is set as a secret env var (ADMIN_TOKEN) on Cloudflare Pages.
 * n8n sends `Authorization: Bearer <token>` on every publish/pick request.
 */
import { getEnv } from "./d1";

export function verifyAdminRequest(req: Request): { ok: boolean; error?: string } {
  const configured = getEnv().ADMIN_TOKEN;
  if (!configured) return { ok: false, error: "ADMIN_TOKEN not configured on server" };
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return { ok: false, error: "Missing or malformed Authorization header (expected 'Bearer <token>')" };
  }
  // Constant-time compare to avoid timing leaks
  if (token.length !== configured.length) return { ok: false, error: "Invalid token" };
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ configured.charCodeAt(i);
  if (diff !== 0) return { ok: false, error: "Invalid token" };
  return { ok: true };
}
