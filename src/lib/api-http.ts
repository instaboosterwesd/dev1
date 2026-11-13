import { tokenExists, validToken } from "./balance";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

export const PANEL_KEY = "dev";

/** Returns an error Response when the token is missing/unknown, otherwise null. */
export async function checkToken(token: unknown): Promise<Response | null> {
  if (!validToken(token)) return json({ error: "token required" }, 401);
  if (!(await tokenExists(token))) return json({ error: "invalid token" }, 401);
  return null;
}

export async function readBody(request: Request): Promise<Body | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Body) : null;
  } catch {
    return null;
  }
}

type Body = { token?: unknown; userId?: unknown; balance?: unknown; key?: unknown; mode?: unknown; min?: unknown; max?: unknown };
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : v);
