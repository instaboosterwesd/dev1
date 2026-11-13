import { createFileRoute } from "@tanstack/react-router";
import { fetchCrashConfig, fetchCurrent, generateUpcoming, saveCrashConfig, saveUpcoming } from "@/lib/crash-config";
import { checkToken, corsHeaders, json, readBody, str } from "@/lib/api-http";

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token")?.trim();
        const bad = await checkToken(token);
        if (bad) return bad;
        return json(await fetchCrashConfig(token as string));
      },
      POST: async ({ request }) => {
        const b = await readBody(request);
        if (!b) return json({ error: "invalid JSON body" }, 400);
        const token = str(b.token);
        const bad = await checkToken(token);
        if (bad) return bad;
        const mode = b.mode === "manual" ? "manual" : "auto";
        const min = Number(b.min);
        const max = Number(b.max);
        if (mode === "manual" && (!Number.isFinite(min) || !Number.isFinite(max) || min < 1.01 || max < min))
          return json({ error: "min must be >= 1.01 and max >= min" }, 400);
        const cfg = { mode, min: mode === "manual" ? min : 1.01, max: mode === "manual" ? max : 3 } as const;
        await saveCrashConfig(cfg, token as string);
        const upcoming = generateUpcoming(cfg);
        await saveUpcoming(upcoming, token as string);
        return json({ success: true, token, ...cfg, now: await fetchCurrent(token as string), next: upcoming[0], upcoming });
      },
    },
  },
});
