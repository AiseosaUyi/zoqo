"use client";
import * as React from "react";
import { KeyRound, Trash2, Check, Copy } from "lucide-react";
import { Button, Card, Input, Select, Switch, Tag, EmptyState } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { SettingsTopNav } from "@/components/settings/SettingsTopNav";
import { MOBILE_NAV_SAFE_PADDING } from "@/components/trade/MobileBottomNav";
import { cn } from "@/lib/cn";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scope: "read" | "trade";
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Generate/revoke API keys for the Zoqo MCP server (TERMINAL_SPEC.md §7,
 *  src/app/api/mcp/route.ts) — the settings surface PHASE_C_HANDOFF.md's C3
 *  calls for. A `read`-scope key only lets a caller look at the account; a
 *  `trade`-scope key can place real orders and manage automations, so this
 *  page is deliberately explicit about which is which before creation. */
export default function SettingsPage() {
  const { ready, signedIn, openAuth } = useProfile();
  const [keys, setKeys] = React.useState<ApiKeyRow[] | null>(null);
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<"read" | "trade">("read");
  const [creating, setCreating] = React.useState(false);
  const [justCreated, setJustCreated] = React.useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [digestOptIn, setDigestOptIn] = React.useState<boolean | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/settings/api-keys")
      .then((r) => (r.ok ? r.json() : []))
      .then(setKeys);
    fetch("/api/settings/digest")
      .then((r) => (r.ok ? r.json() : { optIn: true }))
      .then((d) => setDigestOptIn(d.optIn));
  }, []);

  React.useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  function toggleDigest() {
    if (digestOptIn === null) return;
    const next = !digestOptIn;
    setDigestOptIn(next);
    void fetch("/api/settings/digest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optIn: next }),
    });
  }

  async function createKey() {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      if (res.ok) {
        const created = await res.json();
        setJustCreated({ rawKey: created.rawKey, name: created.name });
        setName("");
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className={cn("min-h-screen bg-bg", MOBILE_NAV_SAFE_PADDING)}>
      <SettingsTopNav />

      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
        <h1 className="font-display text-[26px] font-black text-ink">Settings</h1>
        <p className="mt-1 text-[13.5px] text-sub">API keys for connecting agents to your Zoqo account.</p>

        {!ready && <div className="mt-6 h-40 animate-pulse rounded-[16px] bg-gray-100" />}

        {ready && !signedIn && (
          <Card padding="lg" className="mt-6 flex flex-col items-center gap-3 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-purple-50 text-purple-600">
              <KeyRound size={22} />
            </span>
            <h2 className="text-[16px] font-bold text-ink">Sign in to manage API keys</h2>
            <Button color="brand" onClick={openAuth}>
              Sign in
            </Button>
          </Card>
        )}

        {ready && signedIn && (
          <>
            <Card padding="lg" className="mt-6">
              <h2 className="text-[15px] font-bold text-ink">Generate a new key</h2>
              <p className="mt-1 text-[12.5px] text-sub">
                A <span className="font-semibold">read</span> key can only look at your account —
                positions, history, quotes. A <span className="font-semibold">trade</span> key can
                place real orders and manage automations. Give a trade key only to an agent you
                actually trust.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Trading bot"' maxLength={40} />
                <Select
                  value={scope}
                  onChange={(v) => setScope(v as "read" | "trade")}
                  data={[{ value: "read", label: "Read" }, { value: "trade", label: "Trade" }]}
                />
                <Button color="brand" onClick={createKey} disabled={!name.trim() || creating}>
                  Generate key
                </Button>
              </div>
            </Card>

            {justCreated && (
              <Card padding="lg" className="mt-4 border-purple-300 bg-purple-50/40">
                <h3 className="text-[14px] font-bold text-ink">
                  &quot;{justCreated.name}&quot; created — copy this key now, it won&apos;t be shown again
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-[10px] border bg-surface px-3 py-2 text-[12.5px]">
                    {justCreated.rawKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(justCreated.rawKey);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
              </Card>
            )}

            <div className="mt-6">
              <h2 className="text-[15px] font-bold text-ink">Your keys</h2>
              {keys === null && <div className="mt-3 h-24 animate-pulse rounded-[16px] bg-gray-100" />}
              {keys?.length === 0 && (
                <EmptyState icon={KeyRound} title="No API keys yet" description="Generate one above to connect an agent." />
              )}
              <div className="mt-3 flex flex-col gap-2">
                {keys?.map((k) => (
                  <Card key={k.id} padding="md" className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{k.name}</span>
                        <Tag color={k.scope === "trade" ? "gold" : "gray"} size="sm">
                          {k.scope}
                        </Tag>
                        {k.revoked_at && (
                          <Tag color="gray" size="sm">
                            Revoked
                          </Tag>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-sub">
                        {k.key_prefix}··· · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                      </p>
                    </div>
                    {!k.revoked_at && (
                      <button
                        onClick={() => revoke(k.id)}
                        aria-label={`Revoke ${k.name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sub hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            <Card padding="lg" className="mt-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">Daily email digest</h2>
                <p className="mt-1 text-[12.5px] text-sub">
                  Yesterday&apos;s XP, lessons, and paper P&amp;L, plus a weekly nudge on who&apos;s
                  leading the board.
                </p>
              </div>
              {digestOptIn !== null && <Switch checked={digestOptIn} onChange={toggleDigest} label="Digest emails" />}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
