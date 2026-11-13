import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as nextRoute } from "@/routes/api.next";
import { FIREBASE_URL, setScope, takeNextCrash } from "@/lib/crash-config";

afterEach(() => {
  setScope("");
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const get = async (url: string) => {
  const handlers = nextRoute.options.server?.handlers as Record<
    string,
    ((context: { request: Request }) => Promise<Response>) | undefined
  >;
  const handler = handlers["GET"];
  if (!handler) throw new Error("Missing GET handler");
  return handler({ request: new Request(url) });
};

describe("current round crash value", () => {
  it("publishes the round that just started to current.json in the active scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetchMock);
    setScope("ApiScope123");

    const taken = takeNextCrash();
    await settle();

    const calls = fetchMock.mock.calls.filter(([url]) => url === `${FIREBASE_URL}/tokens/ApiScope123.json`);
    // One request per round: current, upcoming and the streamable live summary together.
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String((calls[0] as [string, RequestInit])[1].body));
    expect(body.current).toBe(taken);
    expect(body.live).toEqual({ now: taken, next: body.upcoming[0], upcoming: body.upcoming });
  });

  it("returns now alongside next and upcoming from /api/next", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/createdAt.json")) return { ok: true, json: async () => 123 };
      if (url.endsWith("/crashConfig.json")) return { ok: true, json: async () => ({ mode: "manual", min: 20, max: 30 }) };
      if (url.endsWith("/upcoming.json")) return { ok: true, json: async () => [26.11, 22.4, 28.9, 21.05, 25.6] };
      if (url.endsWith("/current.json")) return { ok: true, json: async () => 24.37 };
      return { ok: true, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await get("https://game.test/api/next?token=ApiScope123");

    expect(await response.json()).toMatchObject({
      token: "ApiScope123",
      mode: "manual",
      now: 24.37,
      next: 26.11,
      stream: `${FIREBASE_URL}/tokens/ApiScope123/live.json`,
      upcoming: [26.11, 22.4, 28.9, 21.05, 25.6],
    });
  });

  it("reports now as null before any round has started", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/createdAt.json")) return { ok: true, json: async () => 123 };
      if (url.endsWith("/crashConfig.json")) return { ok: true, json: async () => ({ mode: "auto", min: 1.01, max: 3 }) };
      if (url.endsWith("/upcoming.json")) return { ok: true, json: async () => [2.5, 5.2, 1.4, 8.1, 3.3] };
      if (url.endsWith("/current.json")) return { ok: true, json: async () => null };
      return { ok: true, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await get("https://game.test/api/next?token=ApiScope123");

    expect(await response.json()).toMatchObject({ now: null, next: 2.5 });
  });
});

describe("live stream events", () => {
  it("merges Firebase put/patch events into the cached value", async () => {
    const { applyStreamEvent } = await import("@/lib/crash-config");
    let v = applyStreamEvent(null, "put", { path: "/", data: { now: 2, next: 3, upcoming: [3] } });
    v = applyStreamEvent(v, "patch", { path: "/", data: { now: 3, next: 4 } });
    v = applyStreamEvent(v, "put", { path: "/upcoming", data: [4, 5] });
    expect(v).toEqual({ now: 3, next: 4, upcoming: [4, 5] });
  });
});
