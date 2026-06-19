"use client";
import * as React from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

export interface NavItem {
  id: string;
  label: string;
}

export function Sidebar({
  items,
  active,
}: {
  items: NavItem[];
  active: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-line px-6">
        <span className="font-display text-[22px] font-black tracking-tight text-ink">
          ZOQO
        </span>
        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-600">
          System
        </span>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Reference
        </div>
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            className={cn(
              "block rounded-[8px] px-3 py-2 text-[13.5px] font-medium transition-colors",
              active === it.id
                ? "bg-purple-50 text-purple-700"
                : "text-sub hover:bg-gray-50 hover:text-ink",
            )}
          >
            {it.label}
          </a>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-3">
        <Link
          href="/trade"
          className="flex items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-[13px] font-medium text-sub transition-colors hover:bg-gray-50 hover:text-ink"
        >
          <TrendingUp size={15} className="text-purple-500" />
          Open Product
        </Link>
      </div>
      <div className="border-t border-line px-6 py-4 text-[11px] leading-relaxed text-gray-400">
        Tokens are live-editable.
        <br />
        Built from <code className="text-sub">src/lib/tokens.ts</code>.
      </div>
    </aside>
  );
}
