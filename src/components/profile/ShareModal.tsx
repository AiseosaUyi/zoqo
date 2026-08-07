"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2, X as XClose } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";

export function ShareModal({
  open,
  onClose,
  name,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  seed: string;
}) {
  // Both flip back on their own via setTimeout below, so a reopen within
  // that window just shows the still-valid prior feedback — no reset effect
  // needed.
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);

  if (!open || typeof document === "undefined") return null;

  const url = window.location.href;
  const shareText = `Check out ${name}'s ZOQO trading profile`;
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied/unavailable — the link text below is
      // still selectable, so this isn't a dead end, just surface it.
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2200);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `${name} · ZOQO`, text: shareText, url });
    } catch {
      /* user cancelled the native share sheet — no-op */
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop w-full max-w-[400px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(22,20,15,0.25)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-[18px] font-black leading-none text-ink">Share profile</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100">
            <XClose size={18} className="text-sub" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-3 rounded-[14px] border bg-muted p-3">
            <Avatar name={seed} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold leading-tight text-ink">{name}</div>
              <div className="text-[12px] text-sub">ZOQO trading profile</div>
            </div>
          </div>

          <label className="mt-4 block text-[12px] font-semibold text-sub">Link</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-[10px] border bg-surface py-1 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate select-all text-[12.5px] text-ink">{url}</span>
            <button
              onClick={copyLink}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                copied ? "bg-green-100 text-green-700" : "bg-gray-900 text-white hover:bg-gray-800",
              )}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {copyFailed && (
            <p className="mt-1.5 text-[12px] font-medium text-red-600">
              Couldn&apos;t copy automatically — the link above is selected, copy it manually.
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <a
              href={xShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-gray-50"
            >
              <XLogo size={14} />
              Share on X
            </a>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button
                onClick={nativeShare}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-gray-50"
              >
                <Share2 size={14} />
                More
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function XLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
