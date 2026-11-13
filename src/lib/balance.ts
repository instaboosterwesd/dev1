import { scopeBase, scopeToken, FIREBASE_URL } from "./crash-config";

export const DEFAULT_USER_ID = "11020000102087";

const clean = (id: string) => id.replace(/[.#$\[\]/]/g, "").slice(0, 64);

export async function getBalance(userId: string, token = scopeToken): Promise<number | null> {
  const r = await fetch(`${scopeBase(token)}/users/${clean(userId)}/balance.json`);
  if (!r.ok) throw new Error("Could not read balance");
  const d = await r.json();
  return typeof d === "number" ? d : null;
}

export async function setBalance(userId: string, balance: number, token = scopeToken) {
  const r = await fetch(`${scopeBase(token)}/users/${clean(userId)}/balance.json`, {
    method: "PUT",
    body: JSON.stringify(Number(balance.toFixed(2))),
  });
  if (!r.ok) throw new Error("Could not save balance");
}

export async function changeBalance(userId: string, delta: number): Promise<number> {
  const current = (await getBalance(userId)) ?? 0;
  const next = Math.max(0, Number((current + delta).toFixed(2)));
  await setBalance(userId, next);
  return next;
}

export async function listUsers(token = scopeToken): Promise<{ userId: string; balance: number }[]> {
  const r = await fetch(`${scopeBase(token)}/users.json`);
  if (!r.ok) throw new Error("Could not load users");
  const d = (await r.json()) as Record<string, { balance?: number }> | null;
  return Object.entries(d ?? {}).map(([userId, v]) => ({ userId, balance: Number(v?.balance ?? 0) }));
}

export const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9]{8,64}$/.test(t);

export async function tokenExists(token: string) {
  const r = await fetch(`${FIREBASE_URL}/tokens/${token}/createdAt.json`);
  if (!r.ok) throw new Error("Could not verify token");
  return (await r.json()) !== null;
}

export async function createToken(): Promise<string> {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const token = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  const r = await fetch(`${FIREBASE_URL}/tokens/${token}.json`, {
    method: "PUT",
    body: JSON.stringify({ createdAt: Date.now(), crashConfig: { mode: "auto", min: 1.01, max: 3 } }),
  });
  if (!r.ok) throw new Error("Could not create token");
  return token;
}
