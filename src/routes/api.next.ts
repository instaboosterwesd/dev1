import { createFileRoute } from "@tanstack/react-router";
import { ensureUpcoming, fetchCrashConfig, fetchCurrent, liveStreamUrl } from "@/lib/crash-config";
import { checkToken, corsHeaders, json } from "@/lib/api-http";

/** Shows the pre-decided crash value of the next round (and a few after) for a token. */
export const Route = createFileRoute("/api/next")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token")?.trim();
        const bad = await checkToken(token);
        if (bad) return bad;
        const t = token as string;
        const config = await fetchCrashConfig(t);
        const [upcoming, now] = await Promise.all([ensureUpcoming(t, config), fetchCurrent(t)]);
        const res = json({ token: t, mode: config.mode, min: config.min, max: config.max, now, next: upcoming[0], upcoming, stream: liveStreamUrl(t) });
        // Let the CDN answer repeated polls for 1s so one origin call serves many requests.
        res.headers.set("Cache-Control", "public, max-age=1, s-maxage=1, stale-while-revalidate=2");
        return res;
      },
    },
  },
});
