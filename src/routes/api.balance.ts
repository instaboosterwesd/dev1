import { createFileRoute } from "@tanstack/react-router";
import { getBalance, setBalance } from "@/lib/balance";
import { checkToken, corsHeaders, json, readBody, str } from "@/lib/api-http";

const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

async function update(origin: string, token: unknown, userId: unknown, balance: unknown) {
  const bad = await checkToken(token);
  if (bad) return bad;
  if (!validId(userId)) return json({ error: "userId required (letters, numbers, _ or -, max 64)" }, 400);
  const amount = Number(balance);
  if (balance === null || balance === undefined || balance === "" || !Number.isFinite(amount) || amount < 0)
    return json({ error: "balance must be a number >= 0" }, 400);
  const t = token as string;
  const existed = (await getBalance(userId, t)) !== null;
  await setBalance(userId, amount, t);
  return json({
    success: true,
    message: existed ? "Balance updated successfully" : "User created successfully",
    userId,
    balance: Number(amount.toFixed(2)),
    created: !existed,
    updated: existed,
    url: `${origin}/?token=${t}&userId=${encodeURIComponent(userId)}`,
  });
}

export const Route = createFileRoute("/api/balance")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const p = u.searchParams;
        const token = p.get("token")?.trim();
        const userId = p.get("userId")?.trim();
        if (p.has("balance")) return update(u.origin, token, userId, p.get("balance"));
        const bad = await checkToken(token);
        if (bad) return bad;
        if (!validId(userId)) return json({ error: "userId required" }, 400);
        const balance = await getBalance(userId, token as string);
        if (balance === null) return json({ userId, error: "user not found" }, 404);
        return json({ userId, balance });
      },
      POST: async ({ request }) => {
        const b = await readBody(request);
        if (!b) return json({ error: "invalid JSON body" }, 400);
        return update(new URL(request.url).origin, str(b.token), str(b.userId), b.balance);
      },
    },
  },
});
