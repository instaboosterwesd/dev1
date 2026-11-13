import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createToken, listUsers, setBalance, tokenExists, validToken } from "@/lib/balance";
import { ensureUpcoming, fetchCrashConfig, fetchCurrent, generateUpcoming, saveCrashConfig, saveUpcoming } from "@/lib/crash-config";

export const Route = createFileRoute("/api/")({
  head: () => ({
    meta: [
      { title: "Aviator — Balance API Panel" },
      { name: "description", content: "Manage user balances by user ID." },
      { property: "og:title", content: "Aviator — Balance API Panel" },
      { property: "og:description", content: "Manage user balances by user ID." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApiPanel,
});

type Row = { userId: string; balance: number };

function ApiPanel() {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [users, setUsers] = useState<Row[]>([]);
  const [uid, setUid] = useState("");
  const [bal, setBal] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [at, setAt] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => {
    setToken(localStorage.getItem("api-token") ?? "");
  }, []);
  useEffect(() => {
    if (token) localStorage.setItem("api-token", token);
  }, [token]);

  const load = () =>
    (token ? listUsers(token) : Promise.resolve([]))
      .then((rows) => {
        setUsers(rows);
        setAt(new Date().toLocaleTimeString());
      })
      .catch(() => {
        setMsg("Could not load users from Firebase.");
        setBad(true);
      });

  useEffect(() => {
    if (ok) load();
  }, [ok, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid.trim();
    if (!id) {
      setMsg("Enter a user ID.");
      setBad(true);
      return;
    }
    if (bal === "" || Number.isNaN(Number(bal))) {
      setMsg("Enter a balance amount.");
      setBad(true);
      return;
    }
    if (!token) {
      setMsg("Create or select a token first.");
      setBad(true);
      return;
    }
    setMsg("Saving…");
    setBad(false);
    try {
      await setBalance(id, Number(bal), token);
      setMsg(`Saved ${id} at ₹${Number(bal).toFixed(2)}.`);
      setUid("");
      setBal("");
      load();
    } catch {
      setMsg("Save failed — Firebase rejected the write.");
      setBad(true);
    }
  };

  if (!ok) {
    return (
      <div className="api-scroll">
        <div className="api-gate">
          <form
            className="api-gate-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw === "dev") {
                setErr(false);
                setOk(true);
              } else {
                setErr(true);
              }
            }}
          >
            <h1>Balance API</h1>
            <p>Enter the panel password to open user balances and docs.</p>
            <input
              className="api-input"
              type="password"
              value={pw}
              placeholder="Password"
              onChange={(e) => setPw(e.target.value)}
              autoFocus
            />
            <Button className="api-btn" type="submit">
              Open panel
            </Button>
            {err && <p className="api-note err">Wrong password</p>}
          </form>
        </div>
      </div>
    );
  }

  const total = users.reduce((s, u) => s + u.balance, 0);
  const shown = q.trim()
    ? users.filter((u) => u.userId.toLowerCase().includes(q.trim().toLowerCase()))
    : users;

  return (
    <div className="api-scroll">
      <div className="api-wrap">
        <header className="api-topbar">
          <div className="api-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
            </svg>
            Balance API
            <span className="api-tag">Firebase</span>
          </div>
          <div className="api-spacer" />
          <a className="api-link" href={token ? `/?token=${token}` : "/"} target="_blank" rel="noreferrer">
            Open game
          </a>
          <Button className="api-link" type="button" onClick={load}>
            Refresh
          </Button>
          <Button
            className="api-link danger"
            type="button"
            onClick={() => {
              setOk(false);
              setPw("");
              setMsg("");
            }}
          >
            Lock
          </Button>
        </header>

        <TokenCard token={token} onToken={setToken} />

        <section className="api-card">
          <h2>Overview {token && <code>{token.slice(0, 8)}…</code>}</h2>
          <div className="api-stats">
            <div className="api-stat">
              <span>Users</span>
              <strong>{users.length}</strong>
            </div>
            <div className="api-stat">
              <span>Total balance</span>
              <strong>₹{total.toFixed(2)}</strong>
            </div>
            <div className="api-stat">
              <span>Updated</span>
              <strong>{at || "—"}</strong>
            </div>
          </div>

          <form className="api-form" onSubmit={submit}>
            <input
              className="api-input grow"
              placeholder="User ID — e.g. 11020000102087"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
            />
            <input
              className="api-input"
              placeholder="Balance (INR)"
              type="number"
              step="0.01"
              min="0"
              value={bal}
              onChange={(e) => setBal(e.target.value)}
            />
            <Button className="api-btn" type="submit">
              Save
            </Button>
            {(uid || bal) && (
              <Button
                className="api-btn ghost"
                type="button"
                onClick={() => {
                  setUid("");
                  setBal("");
                  setMsg("");
                }}
              >
                Clear
              </Button>
            )}
          </form>
          {msg && <p className={"api-note" + (bad ? " err" : "")}>{msg}</p>}
        </section>

        <section className="api-card">
          <h2>Users</h2>
          <div className="api-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              className="api-input"
              placeholder="Search user ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <table className="api-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Balance (INR)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.userId}>
                  <td>
                    <a href={`/?token=${token}&userId=${encodeURIComponent(u.userId)}`} target="_blank" rel="noreferrer">
                      {u.userId}
                    </a>
                  </td>
                  <td className="num">{u.balance.toFixed(2)}</td>
                  <td className="act">
                    <Button
                      className="api-mini"
                      type="button"
                      onClick={() => {
                        setUid(u.userId);
                        setBal(String(u.balance));
                        setMsg("");
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="api-empty">{users.length === 0 ? "No users yet." : "No user matches that search."}</p>
          )}
        </section>

        <Docs token={token} />
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = children;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1200);
  };
  return (
    <div className="api-code">
      <pre>{children}</pre>
      <Button className="api-copy" type="button" onClick={copy}>
        {done ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function TokenCard({ token, onToken }: { token: string; onToken: (t: string) => void }) {
  const [draft, setDraft] = useState(token);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [min, setMin] = useState("1.01");
  const [max, setMax] = useState("3");
  const [note, setNote] = useState("");
  const [upcoming, setUpcoming] = useState<number[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const refreshNext = () => {
    if (!token) return;
    Promise.all([ensureUpcoming(token), fetchCurrent(token)])
      .then(([list, cur]) => {
        setUpcoming(list);
        setNow(cur);
      })
      .catch(() => {});
  };
  useEffect(() => {
    setDraft(token);
    setUpcoming([]);
    setNow(null);
    refreshNext();
    if (!token) return;
    fetchCrashConfig(token).then((c) => {
      setMode(c.mode);
      setMin(String(c.min));
      setMax(String(c.max));
    }).catch(() => setNote("Could not load crash settings."));
  }, [token]);

  const create = async () => {
    setNote("Creating…");
    const t = await createToken();
    onToken(t);
    setNote("New token created.");
  };
  const use = async () => {
    const t = draft.trim();
    if (!validToken(t) || !(await tokenExists(t))) return setNote("That token does not exist.");
    onToken(t);
    setNote("Token selected.");
  };
  const save = async () => {
    const lo = Number(min);
    const hi = Number(max);
    if (mode === "manual" && (!(lo >= 1.01) || !(hi >= lo))) return setNote("Min must be ≥ 1.01 and max ≥ min.");
    const cfg = { mode, min: mode === "manual" ? lo : 1.01, max: mode === "manual" ? hi : 3 } as const;
    await saveCrashConfig(cfg, token);
    const list = generateUpcoming(cfg);
    await saveUpcoming(list, token);
    setUpcoming(list);
    setNote(mode === "manual" ? `Saved: this token's users crash between ${lo}x and ${hi}x.` : "Saved: random crash.");
  };

  return (
    <section className="api-card">
      <h2>Token</h2>
      <p>Each token has its own users, balances and crash setting.</p>
      <div className="api-form">
        <input className="api-input grow" placeholder="Paste a token" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button className="api-btn ghost" type="button" onClick={use}>Use</Button>
        <Button className="api-btn" type="button" onClick={create}>Create a Token</Button>
      </div>
      {token && (
        <>
          <Code>{token}</Code>
          <h3>Crash setting for this token</h3>
          <div className="api-form">
            <select className="api-input" value={mode} onChange={(e) => setMode(e.target.value as "auto" | "manual")}>
              <option value="auto">Auto (random)</option>
              <option value="manual">Manual range</option>
            </select>
            {mode === "manual" && (
              <>
                <label className="api-note">Min</label>
                <input className="api-input" type="number" step="0.01" min="1.01" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min x" />
                <label className="api-note">Max</label>
                <input className="api-input" type="number" step="0.01" min="1.01" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max x" />
              </>
            )}
            <Button className="api-btn" type="button" onClick={save}>Save</Button>
          </div>
          <p className="api-note">
            Now flying: <b>{now ? `${now.toFixed(2)}x` : "—"}</b>
            {" · "}
            Next crash: <b>{upcoming[0] ? `${upcoming[0].toFixed(2)}x` : "—"}</b>
            {upcoming.length > 1 && <> · then {upcoming.slice(1).map((v) => `${v.toFixed(2)}x`).join(", ")}</>}{" "}
            <Button className="api-btn ghost" type="button" onClick={refreshNext}>Refresh</Button>
          </p>
        </>
      )}
      {note && <p className="api-note">{note}</p>}
    </section>
  );
}

function Docs({ token }: { token: string }) {
  const t = token || "YOUR_TOKEN";
  const [o, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <section className="api-card">
      <h2>API documentation</h2>
      <p>
        Every request needs a <code>token</code>. Users and balances are kept separate per token. User ID: letters,
        numbers, <code>_</code> or <code>-</code>, up to 64 characters. Balance is INR.
      </p>

      <h3>1. Create a token</h3>
      <Code>{`POST ${o}/api/token
Content-Type: application/json

{"key":"dev"}`}</Code>
      <Code>{`Response 200: {"success":true,"token":"..."}`}</Code>

      <h3>2. Set balance (creates user if new) — returns play link</h3>
      <Code>{`POST ${o}/api/balance
Content-Type: application/json

{"token":"${t}","userId":"11020000102087","balance":500}`}</Code>
      <Code>{`Response 200: {"success":true,"message":"Balance updated successfully","userId":"11020000102087","balance":500,"created":false,"updated":true,"url":"${o}/?token=${t}&userId=11020000102087"}`}</Code>
      <p>Open <code>url</code> to play. Bets deduct and cash outs add to the saved balance live.</p>

      <h3>3. Get balance</h3>
      <Code>{`GET ${o}/api/balance?token=${t}&userId=11020000102087`}</Code>
      <Code>{`Response 200: {"userId":"11020000102087","balance":480}
Response 404: {"userId":"...","error":"user not found"}
Response 401: {"error":"invalid token"}`}</Code>

      <h3>4. Crash setting for this token</h3>
      <Code>{`POST ${o}/api/config
Content-Type: application/json

{"token":"${t}","mode":"manual","min":2,"max":2}`}</Code>
      <p>Use <code>"mode":"auto"</code> for random. Read it with <code>GET {o}/api/config?token={t}</code>.</p>
      <p>Manual: every round crashes at a random value between <code>min</code> and <code>max</code> (e.g. 20–30). Auto: random like 2.5x, 5.2x. Saving resets the upcoming values.</p>

      <h3>5. See the crash value of the current and next rounds</h3>
      <Code>{`GET ${o}/api/next?token=${t}`}</Code>
      <Code>{`Response 200: {"token":"${t}","mode":"manual","min":20,"max":30,"now":24.37,"next":26.11,"upcoming":[26.11,22.4,28.9,21.05,25.6]}`}</Code>
      <p><code>now</code> is the crash value of the round flying right now (<code>null</code> before the first round starts). <code>next</code> is the round after it; <code>upcoming</code> lists the coming rounds in order. <code>now</code> switches to the new round the instant the previous one crashes.</p>

    </section>
  );
}
