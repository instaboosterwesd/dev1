import { createFileRoute } from "@tanstack/react-router";
import { createToken } from "@/lib/balance";
import { corsHeaders, json, PANEL_KEY, readBody } from "@/lib/api-http";

export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const b = await readBody(request);
        if (b?.key !== PANEL_KEY) return json({ error: "invalid key" }, 401);
        const token = await createToken();
        return json({ success: true, token });
      },
    },
  },
});
