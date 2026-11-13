export const FIREBASE_URL = "https://aviator-340c0-default-rtdb.firebaseio.com";

/** Active token scope; an empty scope preserves legacy global data. */
export let scopeToken = "";
export function setScope(token: string) {
  scopeToken = /^[A-Za-z0-9]{8,64}$/.test(token) ? token : "";
}
export const scopeBase = (token = scopeToken) =>
  token ? `${FIREBASE_URL}/tokens/${token}` : FIREBASE_URL;

export type CrashConfig = { mode: "auto" | "manual"; min: number; max: number };

export let crashConfig: CrashConfig = { mode: "auto", min: 1.01, max: 3 };

export async function fetchCrashConfig(token = scopeToken): Promise<CrashConfig> {
  const r = await fetch(`${scopeBase(token)}/crashConfig.json`);
  const d = await r.json();
  if (d && (d.mode === "auto" || d.mode === "manual")) {
    crashConfig = { mode: d.mode, min: Number(d.min) || 1.01, max: Number(d.max) || 2 };
  }
  return crashConfig;
}

export async function saveCrashConfig(c: CrashConfig, token = scopeToken) {
  await fetch(`${scopeBase(token)}/crashConfig.json`, { method: "PUT", body: JSON.stringify(c) });
  crashConfig = c;
}

/** Applies one Firebase streaming event ({path, data}) to a cached value. */
export function applyStreamEvent(prev: unknown, type: string, payload: { path?: string; data?: unknown }): unknown {
  const parts = (payload.path ?? "/").split("/").filter(Boolean);
  if (parts.length === 0) {
    if (type === "patch" && prev && typeof prev === "object" && payload.data && typeof payload.data === "object") {
      return { ...(prev as object), ...(payload.data as object) };
    }
    return payload.data;
  }
  const root: Record<string, unknown> = prev && typeof prev === "object" ? structuredClone(prev as Record<string, unknown>) : {};
  let node = root;
  for (const k of parts.slice(0, -1)) {
    if (!node[k] || typeof node[k] !== "object") node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] as string;
  if (type === "patch" && payload.data && typeof payload.data === "object") {
    node[last] = { ...((node[last] as object) ?? {}), ...(payload.data as object) };
  } else node[last] = payload.data;
  return root;
}

/** Opens one long-lived Firebase stream instead of polling. Returns a stop function. */
export function streamValue(url: string, onValue: (v: unknown) => void) {
  let value: unknown = null;
  const es = new EventSource(url);
  const handle = (type: string) => (e: MessageEvent) => {
    try {
      value = applyStreamEvent(value, type, JSON.parse(e.data));
      onValue(value);
    } catch { /* ignore malformed events */ }
  };
  es.addEventListener("put", handle("put"));
  es.addEventListener("patch", handle("patch"));
  return () => es.close();
}

/** Keeps crashConfig and the upcoming list in sync through live streams (no polling). */
export function watchCrashConfig() {
  const stopCfg = streamValue(`${scopeBase()}/crashConfig.json`, (d) => {
    const c = d as Partial<CrashConfig> | null;
    if (c && (c.mode === "auto" || c.mode === "manual")) {
      crashConfig = { mode: c.mode, min: Number(c.min) || 1.01, max: Number(c.max) || 2 };
    }
  });
  const stopUp = streamValue(`${scopeBase()}/upcoming.json`, (d) => {
    if (pendingWrite === 0 && validList(d)) upcomingCache = d;
  });
  return () => { stopCfg(); stopUp(); };
}

/* ---------- Upcoming crash values (pre-decided, visible via /api/next) ---------- */

export const UPCOMING_COUNT = 5;
const MAX_CRASH = 1000;
const round2 = (n: number) => Number(Math.min(MAX_CRASH, Math.max(1.01, n)).toFixed(2));

/** Random crash value: inside [min,max] for manual mode, weighted random for auto. */
export function generateCrash(c: CrashConfig = crashConfig, rand: () => number = Math.random): number {
  if (c.mode === "manual") {
    const lo = Math.max(1.01, Math.min(c.min, c.max));
    const hi = Math.max(lo, c.min, c.max);
    return round2(lo + rand() * (hi - lo));
  }
  const roll = rand();
  const r = rand();
  if (roll < 0.58) return round2(1.01 + r * 1.99);
  if (roll < 0.88) return round2(3 + r * 6.99);
  if (roll < 0.97) return round2(10 + r * 9.99);
  if (roll < 0.992) return round2(20 + r * 29.99);
  if (roll < 0.998) return round2(50 + r * 49.99);
  if (roll < 0.9998) return round2(100 + r * 399.99);
  return round2(500 + r * 500);
}

export const generateUpcoming = (c: CrashConfig, n = UPCOMING_COUNT) => Array.from({ length: n }, () => generateCrash(c));

const validList = (d: unknown): d is number[] =>
  Array.isArray(d) && d.length > 0 && d.every((v) => typeof v === "number" && v >= 1.01);

export async function fetchUpcoming(token = scopeToken): Promise<number[] | null> {
  const r = await fetch(`${scopeBase(token)}/upcoming.json`);
  const d = await r.json();
  return validList(d) ? d : null;
}

export async function saveUpcoming(list: number[], token = scopeToken) {
  // One multi-path write keeps the streamable `live` summary in step with the list.
  await fetch(`${scopeBase(token)}.json`, {
    method: "PATCH",
    body: JSON.stringify({ upcoming: list, "live/next": list[0] ?? null, "live/upcoming": list }),
  });
}

/* ---------- Current round: the crash value of the round flying right now ---------- */

export async function fetchCurrent(token = scopeToken): Promise<number | null> {
  const r = await fetch(`${scopeBase(token)}/current.json`);
  const d = await r.json();
  return typeof d === "number" && d >= 1.01 ? d : null;
}

export async function saveCurrent(value: number, token = scopeToken) {
  await fetch(`${scopeBase(token)}/current.json`, { method: "PUT", body: JSON.stringify(value) });
}

/** Server/API: read the upcoming list, creating it from the config when missing. */
export async function ensureUpcoming(token: string, cfg?: CrashConfig): Promise<number[]> {
  const existing = await fetchUpcoming(token);
  if (existing && existing.length >= UPCOMING_COUNT) return existing;
  const c = cfg ?? (await fetchCrashConfig(token));
  const list = [...(existing ?? []), ...generateUpcoming(c)].slice(0, UPCOMING_COUNT);
  await saveUpcoming(list, token);
  return list;
}

/* Game-side cache so the round loop can pick synchronously. */
let upcomingCache: number[] = [];
let pendingWrite = 0;
let currentWrite: Promise<unknown> = Promise.resolve();

/** Publishes upcoming, current and the streamable `live` summary in ONE ordered write. */
function publishRound(now: number, upcoming: number[]) {
  const token = scopeToken;
  pendingWrite++;
  currentWrite = currentWrite
    .then(() => fetch(`${scopeBase(token)}.json`, {
      method: "PATCH",
      body: JSON.stringify({ current: now, upcoming, live: { now, next: upcoming[0], upcoming } }),
    }))
    .catch(() => {})
    .finally(() => { pendingWrite--; });
}

/** Game: take the next crash value and publish the refilled list. */
export function takeNextCrash(): number {
  const next = upcomingCache[0] ?? generateCrash();
  const rest = upcomingCache.slice(1);
  while (rest.length < UPCOMING_COUNT) rest.push(generateCrash());
  upcomingCache = rest;
  publishRound(next, rest);
  return next;
}

/* ---------- Crash moment: publish the next round as "now" immediately ---------- */

let preTaken: number | null = null;

/** Game: call the instant a round crashes. Publishes the next round as `now`. */
export function announceCrash(_crashed: number) {
  if (preTaken !== null) return;
  preTaken = takeNextCrash();
}

/** Game: crash value for the round that is starting (uses the one announced at crash time if any). */
export function consumeNextCrash(): number {
  if (preTaken !== null) {
    const v = preTaken;
    preTaken = null;
    return v;
  }
  return takeNextCrash();
}

async function syncUpcoming() {
  const list = await fetchUpcoming();
  if (pendingWrite === 0 && list) upcomingCache = list;
}

/** Live stream URL (Server-Sent Events) that pushes {now, next, upcoming} on every change. */
export const liveStreamUrl = (token: string) => `${scopeBase(token)}/live.json`;

/** Load the shared upcoming list before the first round (resolves quickly even on failure). */
export async function loadUpcoming() {
  await Promise.race([syncUpcoming().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
}
