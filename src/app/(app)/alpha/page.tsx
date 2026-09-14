"use client";
import * as React from "react";
import { ServerOff, ShieldAlert } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { BACKEND_ENABLED } from "@/lib/getDataStore";
import { AlphaHeader, AlphaBackRow } from "@/components/alpha/AlphaHeader";
import { AlphaEmptyState } from "@/components/alpha/AlphaEmptyState";
import { AlphaGettingStarted } from "@/components/alpha/AlphaGettingStarted";
import { KillSwitchCard } from "@/components/alpha/KillSwitchCard";
import { VenuesSection } from "@/components/alpha/VenuesSection";
import { StrategiesSection } from "@/components/alpha/StrategiesSection";
import { DecisionsFeed } from "@/components/alpha/DecisionsFeed";
import { EventsFeed } from "@/components/alpha/EventsFeed";
import { FixturesSection } from "@/components/alpha/FixturesSection";
import { CredentialsSection, type AlphaCredentialDto } from "@/components/alpha/CredentialsSection";
import { ProposalsInbox } from "@/components/alpha/ProposalsInbox";
import { CopySourcesSection } from "@/components/alpha/CopySourcesSection";
import type { CreateStrategyInput } from "@/components/alpha/CreateStrategyModal";
import type {
  AlphaSettingsDto,
  AlphaVenueDto,
  AlphaStrategyDto,
  AlphaTemplateDto,
  AlphaDecisionDto,
  AlphaEventDto,
  AlphaFixtureDto,
  AlphaProposalDto,
  AlphaSlipSelection,
  AlphaSlipResultDto,
  AlphaHealthDto,
  AlphaCopySourceDto,
} from "@/components/alpha/types";

/** ZOQO Alpha's dashboard (docs/alpha/03-architecture.md §9, scoped down to
 *  Phase 1's real data — no fixtures/proposals/credentials UI yet, those
 *  land in Phase 3/4/5). Every section here is a thin fetch over
 *  src/app/api/alpha/*'s routes, which are themselves thin wrappers over
 *  src/lib/alpha/service.ts — no business logic lives on this page.
 *
 *  Alpha is server-first with no localStorage fallback (CLAUDE.md's
 *  Backend section), so unlike every other page in this app there is no
 *  degraded-but-working mode without a real session — the two empty states
 *  below (backend off, signed out) are the honest alternative to a broken
 *  fetch or a page that silently shows nothing. */

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function AlphaPage() {
  const { ready, signedIn, openAuth } = useProfile();

  const [settings, setSettings] = React.useState<AlphaSettingsDto | null>(null);
  const [venues, setVenues] = React.useState<AlphaVenueDto[]>([]);
  const [strategies, setStrategies] = React.useState<AlphaStrategyDto[]>([]);
  const [templates, setTemplates] = React.useState<AlphaTemplateDto[]>([]);
  const [decisions, setDecisions] = React.useState<AlphaDecisionDto[]>([]);
  const [events, setEvents] = React.useState<AlphaEventDto[]>([]);
  const [proposals, setProposals] = React.useState<AlphaProposalDto[]>([]);
  const [fixtures, setFixtures] = React.useState<AlphaFixtureDto[]>([]);
  const [credentials, setCredentials] = React.useState<AlphaCredentialDto[]>([]);
  const [health, setHealth] = React.useState<AlphaHealthDto | null>(null);
  const [copySources, setCopySources] = React.useState<AlphaCopySourceDto[]>([]);
  const [proposingCopySources, setProposingCopySources] = React.useState(false);
  const [slipResult, setSlipResult] = React.useState<AlphaSlipResultDto | null>(null);
  const [slipLoading, setSlipLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    const [s, v, st, tpl, dec, ev, prop, fx, cred, hp, cs] = await Promise.all([
      fetchJson<AlphaSettingsDto>("/api/alpha/settings"),
      fetchJson<AlphaVenueDto[]>("/api/alpha/venues"),
      fetchJson<AlphaStrategyDto[]>("/api/alpha/strategies"),
      fetchJson<AlphaTemplateDto[]>("/api/alpha/strategy-templates"),
      fetchJson<AlphaDecisionDto[]>("/api/alpha/decisions?limit=25"),
      fetchJson<AlphaEventDto[]>("/api/alpha/events?limit=25"),
      fetchJson<AlphaProposalDto[]>("/api/alpha/proposals"),
      fetchJson<AlphaFixtureDto[]>("/api/alpha/fixtures?limit=20"),
      fetchJson<AlphaCredentialDto[]>("/api/alpha/credentials"),
      fetchJson<AlphaHealthDto>("/api/alpha/health"),
      fetchJson<AlphaCopySourceDto[]>("/api/alpha/copy-sources"),
    ]);
    if (s == null || v == null || st == null || tpl == null || dec == null || ev == null || prop == null || fx == null || cred == null) {
      setLoadFailed(true);
      setLoaded(true);
      return;
    }
    setSettings(s);
    setVenues(v);
    setStrategies(st);
    setTemplates(tpl);
    setDecisions(dec);
    setEvents(ev);
    setProposals(prop);
    setFixtures(fx);
    setCredentials(cred);
    setHealth(hp); // best-effort — a null health fetch just hides the needs-setup panel, not a page-level failure
    setCopySources(cs ?? []); // best-effort, same as health
    setLoadFailed(false);
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    // loadAll() is an async fetch-and-setState function, not a synchronous
    // setState call — same shape as CreateAutomationModal's pending-submit
    // effect (see that file's identical disable comment).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (BACKEND_ENABLED && signedIn) void loadAll();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [signedIn, loadAll]);

  async function setKillSwitch(on: boolean) {
    setSettings((prev) => (prev ? { ...prev, killSwitch: on } : prev));
    await fetch("/api/alpha/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ killSwitch: on }),
    });
  }

  async function saveVenue(patch: { venue: string; enabled?: boolean; maxStake?: number; dailyCap?: number; dailyLossStop?: number }) {
    await fetch("/api/alpha/venues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    void loadAll();
  }

  async function createStrategy(input: CreateStrategyInput) {
    await fetch("/api/alpha/strategies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    void loadAll();
  }

  async function runNow(id: string) {
    await fetch(`/api/alpha/strategies/${id}/run`, { method: "POST" });
    void loadAll();
  }

  async function pause(id: string) {
    await fetch(`/api/alpha/strategies/${id}/pause`, { method: "POST" });
    void loadAll();
  }

  async function resume(id: string) {
    await fetch(`/api/alpha/strategies/${id}/resume`, { method: "POST" });
    void loadAll();
  }

  async function ackEvent(id: string) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)));
    await fetch(`/api/alpha/events/${id}/ack`, { method: "POST" });
  }

  async function applyProposal(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/alpha/proposals/${id}/apply`, { method: "POST" });
    void loadAll(); // strategy params changed — refresh strategies too
  }

  async function dismissProposal(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/alpha/proposals/${id}/dismiss`, { method: "POST" });
  }

  async function proposeCopySources(venue: string, candidateRefs?: string[]) {
    setProposingCopySources(true);
    try {
      await fetch("/api/alpha/copy-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue, candidateRefs }),
      });
      void loadAll();
    } finally {
      setProposingCopySources(false);
    }
  }

  async function setCopySourceStatus(id: string, status: AlphaCopySourceDto["status"]) {
    setCopySources((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    await fetch(`/api/alpha/copy-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void loadAll();
  }

  async function buildSlip(selections: AlphaSlipSelection[]) {
    setSlipLoading(true);
    setSlipResult(null);
    try {
      const res = await fetch("/api/alpha/slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const body = (await res.json().catch(() => null)) as AlphaSlipResultDto | { error: string } | null;
      setSlipResult(body ? ("error" in body ? { selections: [], combinedOdds: 0, suggestedStake: null, plainText: "", error: body.error } : body) : { selections: [], combinedOdds: 0, suggestedStake: null, plainText: "", error: "Couldn't reach the slip builder — try again." });
    } finally {
      setSlipLoading(false);
    }
  }

  if (!BACKEND_ENABLED) {
    return (
      <div className="min-h-screen bg-bg">
        <AlphaHeader />
        <AlphaBackRow />
        <AlphaEmptyState
          icon={ServerOff}
          title="Alpha needs the backend enabled"
          description="ZOQO Alpha is server-first — there's no local-only mode for it. Set NEXT_PUBLIC_BACKEND_ENABLED=1 and rebuild to use this page."
        />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg">
        <AlphaHeader />
        <AlphaBackRow />
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <div className="h-40 animate-pulse rounded-[16px] bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-bg">
        <AlphaHeader />
        <AlphaBackRow />
        <AlphaEmptyState
          icon={ShieldAlert}
          title="Sign in to use Alpha"
          description="Strategies, venues, and every decision they make live on your account server-side — sign in to see or run any of it."
          actionLabel="Sign in"
          onAction={openAuth}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <AlphaHeader />
      <AlphaBackRow />

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <h1 className="font-display text-[26px] font-black text-ink">Alpha</h1>
        <p className="mt-1 text-[13.5px] text-sub">
          Autonomous, budget-capped paper strategies — one venue today, more from Phase 2.
        </p>

        {!loaded && <div className="mt-6 h-40 animate-pulse rounded-[16px] bg-gray-100" />}

        {loaded && loadFailed && (
          <AlphaEmptyState
            icon={ServerOff}
            title="Couldn't load Alpha"
            description="Something went wrong reaching the Alpha API — try refreshing the page."
          />
        )}

        {loaded && !loadFailed && settings && (
          <div className="mt-6 flex flex-col gap-8">
            <AlphaGettingStarted venues={venues} strategies={strategies} credentials={health?.credentials} />
            <KillSwitchCard settings={settings} onToggle={setKillSwitch} />
            <VenuesSection venues={venues} onSave={saveVenue} />
            <CredentialsSection credentials={credentials} />
            <StrategiesSection
              templates={templates}
              strategies={strategies}
              onCreate={createStrategy}
              onRunNow={runNow}
              onPause={pause}
              onResume={resume}
            />
            <FixturesSection fixtures={fixtures} onBuildSlip={buildSlip} slipResult={slipResult} slipLoading={slipLoading} />
            <ProposalsInbox proposals={proposals} onApply={applyProposal} onDismiss={dismissProposal} />
            <CopySourcesSection sources={copySources} onPropose={proposeCopySources} onSetStatus={setCopySourceStatus} proposing={proposingCopySources} />
            <DecisionsFeed decisions={decisions} />
            <EventsFeed events={events} onAck={ackEvent} />
          </div>
        )}
      </div>
    </div>
  );
}
