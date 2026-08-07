"use client";
import * as React from "react";
import { SegmentedControl } from "@/components/ui";
import { useZoqo } from "@/lib/store";
import { OverviewTab } from "./OverviewTab";
import { PositionsTab } from "./PositionsTab";
import { OpenOrdersTab } from "./OpenOrdersTab";
import { ActivityTab } from "./ActivityTab";

const TABS = ["Overview", "Positions", "Open Order", "Activities"] as const;

export function ProfileTabs() {
  const { positions, openOrders, tradeHistory } = useZoqo();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Overview");

  const counts: Record<string, number> = {
    Positions: positions.length,
    "Open Order": openOrders.length,
    Activities: tradeHistory.length,
  };

  return (
    <section className="mt-6">
      <SegmentedControl
        data={TABS.map((t) => ({ value: t, label: counts[t] ? `${t} ${counts[t]}` : t }))}
        value={tab}
        onChange={(v) => setTab(v as (typeof TABS)[number])}
        size="sm"
        className="mb-3 inline-flex"
      />

      {tab === "Overview" && <OverviewTab />}
      {tab === "Positions" && <PositionsTab />}
      {tab === "Open Order" && <OpenOrdersTab />}
      {tab === "Activities" && <ActivityTab />}
    </section>
  );
}
