import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREBASE_URL, fetchCrashConfig, saveCrashConfig, scopeBase, setScope } from "../lib/crash-config";

afterEach(() => {
  setScope("");
  vi.unstubAllGlobals();
});

describe("API configuration compatibility", () => {
  it("preserves legacy paths when no token is selected", () => {
    expect(scopeBase()).toBe(FIREBASE_URL);
  });

  it("keeps API reads inside the explicitly supplied token scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ mode: "manual", min: 2, max: 3 }) });
    vi.stubGlobal("fetch", fetchMock);
    setScope("OtherScope123");
    expect(await fetchCrashConfig("ApiScope123")).toEqual({ mode: "manual", min: 2, max: 3 });
    expect(fetchMock).toHaveBeenCalledWith(`${FIREBASE_URL}/tokens/ApiScope123/crashConfig.json`);
  });

  it("keeps API writes inside the explicitly supplied token scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetchMock);
    const config = { mode: "manual" as const, min: 2, max: 3 };
    await saveCrashConfig(config, "ApiScope123");
    expect(fetchMock).toHaveBeenCalledWith(`${FIREBASE_URL}/tokens/ApiScope123/crashConfig.json`, {
      method: "PUT", body: JSON.stringify(config),
    });
  });
});