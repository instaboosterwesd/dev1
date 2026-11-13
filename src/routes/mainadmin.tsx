import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plane,
  LogOut,
  ShieldCheck,
  History,
  SlidersHorizontal,
  Zap,
  User,
  Lock,
  Eye,
  EyeOff,
  Save,
  ChevronRight,
  Clock,
  MonitorSmartphone,
  CircleAlert,
  CircleCheck,
  Gauge,
} from "lucide-react";
import { fetchCrashConfig, saveCrashConfig, type CrashConfig } from "@/lib/crash-config";

const FB = "https://aviator-340c0-default-rtdb.firebaseio.com";

export const Route = createFileRoute("/mainadmin")({
  head: () => ({
    meta: [
      { title: "Admin Login — Aviator" },
      { name: "description", content: "Aviator admin panel login." },
      { property: "og:title", content: "Admin Login — Aviator" },
      { property: "og:description", content: "Aviator admin panel login." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Log = { at: number; ua: string };

/* ---------- Material 3-style building blocks ---------- */

function M3Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 transition-colors duration-200 ${
        checked ? "border-primary bg-primary" : "border-border bg-muted"
      }`}
    >
      <span
        className={`inline-block transform rounded-full shadow transition-all duration-200 ${
          checked ? "h-6 w-6 translate-x-[22px] bg-primary-foreground" : "h-4 w-4 translate-x-[4px] bg-muted-foreground"
        }`}
      />
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showP, setShowP] = useState(false);
  const [err, setErr] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem("mainadmin") === "1") setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch(`${FB}/adminLogins.json?orderBy="$key"&limitToLast=20`)
      .then((r) => r.json())
      .then((d) => setLogs(d ? (Object.values(d) as Log[]).reverse() : []))
      .catch(() => {});
  }, [authed]);

  const [loggingIn, setLoggingIn] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setErr("");
    try {
      const name = u.trim().toLowerCase();
      const r = await fetch(`${FB}/admins/${encodeURIComponent(name)}.json`);
      const admin = await r.json();
      if (admin && admin.password === p) {
        sessionStorage.setItem("mainadmin", "1");
        await fetch(`${FB}/adminLogins.json`, {
          method: "POST",
          body: JSON.stringify({ at: Date.now(), ua: navigator.userAgent }),
        }).catch(() => {});
        setAuthed(true);
      } else {
        setErr("Invalid username or password");
      }
    } catch {
      setErr("Could not connect to the server, please try again");
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("mainadmin");
    setAuthed(false);
    setU("");
    setP("");
  };

  if (!authed)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <form
          onSubmit={login}
          className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-8"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Admin Login</h1>
            <p className="text-sm text-muted-foreground">Aviator control panel</p>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-4 py-3 focus-within:border-primary">
            <User size={20} className="shrink-0 text-muted-foreground" />
            <input
              className="w-full min-w-0 bg-transparent text-foreground outline-none"
              placeholder="Username"
              autoComplete="username"
              value={u}
              onChange={(e) => setU(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-4 py-3 focus-within:border-primary">
            <Lock size={20} className="shrink-0 text-muted-foreground" />
            <input
              type={showP ? "text" : "password"}
              className="w-full min-w-0 bg-transparent text-foreground outline-none"
              placeholder="Password"
              autoComplete="current-password"
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowP((s) => !s)}
              className="shrink-0 text-muted-foreground"
              aria-label={showP ? "Hide password" : "Show password"}
            >
              {showP ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </label>

          {err && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert size={16} className="shrink-0" />
              {err}
            </p>
          )}

          <button
            disabled={loggingIn}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow transition active:scale-[0.98] disabled:opacity-60"
          >
            <LogOut size={18} className="rotate-180" />
            {loggingIn ? "Checking..." : "Login"}
          </button>
        </form>
      </div>
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-10 sm:space-y-6 sm:p-6">
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Plane size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">Admin Dashboard</h1>
              <p className="truncate text-sm text-muted-foreground">Aviator control panel</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition active:scale-[0.98]"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </header>

        <CrashControl />

        {/* Login history */}
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <History size={20} />
            </div>
            <h2 className="min-w-0 truncate font-semibold">Recent admin logins</h2>
          </div>
          {logs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert size={16} className="shrink-0" />
              No records yet
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((l, i) => (
                <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{new Date(l.at).toLocaleString()}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MonitorSmartphone size={12} className="shrink-0" />
                      <span className="truncate">{l.ua || "Unknown device"}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CrashControl() {
  const [cfg, setCfg] = useState<CrashConfig>({ mode: "auto", min: 1.01, max: 3 });
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCrashConfig().then(setCfg).catch(() => {});
  }, []);

  const auto = cfg.mode === "auto";
  const setAuto = (v: boolean) => {
    setCfg({ ...cfg, mode: v ? "auto" : "manual" });
    setMsg("");
    setSaved(false);
  };

  const save = async () => {
    if (cfg.mode === "manual" && (cfg.min < 1.01 || cfg.max < cfg.min)) {
      setSaved(false);
      setMsg("Min must be at least 1.01 and Max must be greater than or equal to Min");
      return;
    }
    setSaving(true);
    try {
      await saveCrashConfig(cfg);
      setMsg("Saved! It will apply from the next round.");
      setSaved(true);
    } catch {
      setSaved(false);
      setMsg("Save failed, please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <SlidersHorizontal size={20} />
        </div>
        <h2 className="min-w-0 truncate font-semibold">Plane Crash Control</h2>
      </div>

      {/* Auto / Manual switch */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Zap size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">Auto mode</p>
            <p className="truncate text-sm text-muted-foreground">
              {auto ? "Random crash on (1.01x–3x)" : "Your set range will be used"}
            </p>
          </div>
        </div>
        <M3Switch checked={auto} onChange={setAuto} />
      </div>

      {/* Manual range inputs */}
      <div
        className={`grid overflow-hidden transition-all duration-300 ${
          auto ? "max-h-0 opacity-0" : "mt-4 max-h-96 opacity-100"
        }`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-4 py-3 focus-within:border-primary">
            <Gauge size={20} className="shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-sm text-muted-foreground">Min (x)</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={cfg.min}
              onChange={(e) => {
                setCfg({ ...cfg, min: Number(e.target.value) });
                setSaved(false);
              }}
              className="w-full min-w-0 bg-transparent text-right text-foreground outline-none"
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-4 py-3 focus-within:border-primary">
            <Gauge size={20} className="shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-sm text-muted-foreground">Max (x)</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={cfg.max}
              onChange={(e) => {
                setCfg({ ...cfg, max: Number(e.target.value) });
                setSaved(false);
              }}
              className="w-full min-w-0 bg-transparent text-right text-foreground outline-none"
            />
          </label>
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
            <ChevronRight size={16} className="shrink-0" />
            Plane will crash randomly between {cfg.min}x and {cfg.max}x.
          </p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow transition active:scale-[0.98] disabled:opacity-60"
      >
        <Save size={18} />
        {saving ? "Saving..." : "Save"}
      </button>

      {msg && (
        <p
          className={`mt-3 flex items-center gap-2 text-sm ${
            saved ? "text-green-600 dark:text-green-400" : "text-destructive"
          }`}
        >
          {saved ? <CircleCheck size={16} className="shrink-0" /> : <CircleAlert size={16} className="shrink-0" />}
          {msg}
        </p>
      )}
    </section>
  );
}
