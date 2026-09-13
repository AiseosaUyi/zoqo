"use client";
import * as React from "react";
import { KeyRound, Check } from "lucide-react";
import { Button, Card, Input, Tag } from "@/components/ui";

/** Per-venue credential entry (docs/alpha/plans/phase-4-extra-venues.md's
 *  credentials manager, scoped down — see src/app/api/alpha/credentials/
 *  route.ts's header for exactly what "scoped down" means here). Mirrors
 *  VenuesSection.tsx's Card layout, and the settings page's API-key
 *  pattern of never re-displaying a submitted/stored secret — the input
 *  clears on save and only a short, non-reversible confirmation prefix is
 *  ever shown back, once, immediately after saving. */

const VENUE_LABELS: Record<string, string> = {
  manifold: "Manifold",
  "kalshi-demo": "Kalshi (demo)",
  "bybit-demo": "Bybit (demo)",
  "deriv-virtual": "Deriv (virtual account)",
};

const CREDENTIAL_VENUES = Object.keys(VENUE_LABELS);

export interface AlphaCredentialDto {
  broker: string;
  scope: string;
  created_at: string;
}

function CredentialRow({
  venue,
  configured,
  onSave,
}: {
  venue: string;
  configured: AlphaCredentialDto | undefined;
  onSave: (venue: string, secret: string) => Promise<string | null>;
}) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    setConfirmation(null);
    const result = await onSave(venue, value.trim());
    setSaving(false);
    if (result == null) {
      setError("Couldn't save this credential — try again.");
      return;
    }
    setConfirmation(result);
    setValue(""); // never keep the submitted secret around once it's saved
  }

  return (
    <div className="flex flex-col gap-2 border-b border-hairline py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-purple-50 text-purple-600">
          <KeyRound size={14} />
        </span>
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{VENUE_LABELS[venue] ?? venue}</p>
          {configured ? (
            <Tag color="up" size="sm">
              configured
            </Tag>
          ) : (
            <Tag color="gray" size="sm">
              not set
            </Tag>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={configured ? "Replace stored key…" : "Paste API key / token…"}
          className="flex-1"
          autoComplete="off"
        />
        <Button color="brand" variant="soft" size="sm" disabled={!value.trim() || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {confirmation && (
        <p className="flex items-center gap-1 text-[12px] text-green-600 sm:basis-full sm:pl-10">
          <Check size={12} /> Saved — key starts with <span className="font-mono">{confirmation}</span>. It won&apos;t be shown again.
        </p>
      )}
      {error && <p className="text-[12px] text-red-600 sm:basis-full sm:pl-10">{error}</p>}
    </div>
  );
}

export function CredentialsSection({ credentials }: { credentials: AlphaCredentialDto[] }) {
  const byVenue = React.useMemo(() => new Map(credentials.map((c) => [c.broker, c])), [credentials]);

  async function handleSave(venue: string, secret: string): Promise<string | null> {
    try {
      const res = await fetch("/api/alpha/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: venue, secret }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { keyPrefix?: string };
      return body.keyPrefix ?? "••••";
    } catch {
      return null;
    }
  }

  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Credentials</h2>
      <p className="mt-1 text-[12.5px] text-sub">
        Per-venue API keys for the external demo venues above. Keys are never displayed again after saving — only a short prefix confirms what was
        stored.
      </p>
      <Card padding="lg" className="mt-3">
        {CREDENTIAL_VENUES.map((venue) => (
          <CredentialRow key={venue} venue={venue} configured={byVenue.get(venue)} onSave={handleSave} />
        ))}
      </Card>
    </section>
  );
}
