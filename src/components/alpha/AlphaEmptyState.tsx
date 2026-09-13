import type { LucideIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";

/** The "sign in / enable backend" empty state /alpha renders instead of a
 *  broken data fetch — Alpha is server-first with no localStorage fallback
 *  (CLAUDE.md's Backend section: "Do not add Alpha state to localStorage"),
 *  so unlike every other page in this app there is nothing to show at all
 *  without a real session. Mirrors the signed-out Card on /settings
 *  (src/app/(app)/settings/page.tsx), the other page whose real data only
 *  exists server-side. */
export function AlphaEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <Card padding="lg" className="mt-6 flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-purple-50 text-purple-600">
          <Icon size={22} />
        </span>
        <h2 className="text-[16px] font-bold text-ink">{title}</h2>
        <p className="max-w-[420px] text-[13px] text-sub">{description}</p>
        {actionLabel && onAction && (
          <Button color="brand" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Card>
    </div>
  );
}
