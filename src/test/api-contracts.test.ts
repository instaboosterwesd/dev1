import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as balanceRoute } from "@/routes/api.balance";
import { Route as configRoute } from "@/routes/api.config";
import { Route as tokenRoute } from "@/routes/api.token";
import { FIREBASE_URL } from "@/lib/crash-config";

afterEach(() => vi.unstubAllGlobals());

// Exercise the handlers themselves: redirects and page passwords do not protect APIs.
const invoke = async (route: typeof balanceRoute | typeof configRoute | typeof tokenRoute, method: string, url: string, body?: unknown) => {
  const handlers = route.options.server?.handlers as Record<string, (context: { request: Request }) => Promise<Response>>;
  const handler = handlers[method];
  if (!handler) throw new Error(`Missing ${method} handler`);
  return handler({ request: new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) }) });
};

describe("Restored API contracts", () => {
  it("rejects a missing token before reading any balance", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await invoke(balanceRoute, "GET", "https://game.test/api/balance?userId=11020000102087");
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a scoped 500 INR user and returns the existing play-link format", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => 123 })
      .mockResolvedValueOnce({ ok: true, json: async () => null }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const response = await invoke(balanceRoute, "POST", "https://game.test/api/balance", { token: "ApiScope123", userId: "11020000102087", balance: 500 });
    expect(await response.json()).toMatchObject({ success: true, balance: 500, created: true, updated: false, url: "https://game.test/?token=ApiScope123&userId=11020000102087" });
    expect(fetchMock).toHaveBeenLastCalledWith(`${FIREBASE_URL}/tokens/ApiScope123/users/11020000102087/balance.json`, expect.objectContaining({ method: "PUT", body: "500" }));
  });

  it("rejects a negative balance without writing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => 123 });
    vi.stubGlobal("fetch", fetchMock);
    const response = await invoke(balanceRoute, "POST", "https://game.test/api/balance", { token: "ApiScope123", userId: "test", balance: -1 });
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps manual crash values 2x–3x inside the requested token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => 123 });
    vi.stubGlobal("fetch", fetchMock);
    const response = await invoke(configRoute, "POST", "https://game.test/api/config", { token: "ApiScope123", mode: "manual", min: 2, max: 3 });
    expect(await response.json()).toMatchObject({ success: true, mode: "manual", min: 2, max: 3 });
    expect(fetchMock).toHaveBeenCalledWith(`${FIREBASE_URL}/tokens/ApiScope123/crashConfig.json`, expect.objectContaining({ method: "PUT" }));
  });

  it("does not create tokens for an invalid panel key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await invoke(tokenRoute, "POST", "https://game.test/api/token", { key: "incorrect" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});