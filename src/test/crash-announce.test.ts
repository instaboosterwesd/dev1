import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREBASE_URL, announceCrash, consumeNextCrash, setScope } from "@/lib/crash-config";

afterEach(() => {
  setScope("");
  vi.unstubAllGlobals();
});
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("crash announcement", () => {
  it("publishes the next round as now at crash time and reuses it when the round starts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetchMock);
    setScope("ApiScope123");

    announceCrash(2.5);
    announceCrash(2.5); // repeated ticks during crash phase do nothing
    await settle();
    await settle();
    const puts = fetchMock.mock.calls.filter(([u]) => u === `${FIREBASE_URL}/tokens/ApiScope123.json`);
    expect(puts).toHaveLength(1);
    const published = JSON.parse(String((puts[0] as [string, RequestInit])[1].body)).current;
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/notify")).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("webhook"))).toBe(false);

    expect(consumeNextCrash()).toBe(published);
    await settle();
    expect(fetchMock.mock.calls.filter(([u]) => u === `${FIREBASE_URL}/tokens/ApiScope123.json`)).toHaveLength(1);
  });
});
