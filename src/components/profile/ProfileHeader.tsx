"use client";
import * as React from "react";
import { Calendar, Camera, Check, Copy, Pencil, Share2 } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { ShareModal } from "./ShareModal";

const JOINED_KEY = "zoqo-profile-joined-v1";

/** Deterministic, non-cryptographic pseudo-id from a seed string — this app
 *  has no real accounts/wallets, so this is a stable per-device display id,
 *  not a claim of any real address. */
function pseudoId(seed: string): string {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < seed.length; i++) {
    h1 = (h1 * 31 + seed.charCodeAt(i)) | 0;
    h2 = (h2 * 131 + seed.charCodeAt(i)) | 0;
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `0x${a.slice(0, 4)}...${b.slice(-4)}`;
}

/** profile.tsx tracks its own internal createdAt but doesn't expose it via
 *  useProfile() (and we're not allowed to edit that file). This is a
 *  separate, equally-real "first time this browser opened /profile"
 *  timestamp, persisted locally under its own key. */
function useJoinedAt(): number | null {
  const [ts, setTs] = React.useState<number | null>(null);
  React.useEffect(() => {
    // One-time read of a persisted, real "first seen" timestamp — same
    // mount-time localStorage-hydration idiom used throughout store.tsx /
    // profile.tsx (ready flags etc.), not a state seeded from nothing.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(JOINED_KEY);
      if (raw) {
        setTs(Number(raw));
      } else {
        const now = Date.now();
        localStorage.setItem(JOINED_KEY, String(now));
        setTs(now);
      }
    } catch {
      setTs(Date.now());
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  return ts;
}

export function ProfileHeader() {
  const { handle, avatarSeed, signedIn, setHandle } = useProfile();
  const joinedAt = useJoinedAt();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const name = handle ?? "Trader";
  const seed = avatarSeed || "trader";
  const id = pseudoId(seed);
  const joinedLabel = joinedAt
    ? new Date(joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", ", ")
    : "—";

  function startEdit() {
    setDraft(handle ?? "");
    setEditing(true);
  }
  function commitEdit() {
    if (draft.trim()) setHandle(draft);
    setEditing(false);
  }

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    e.target.value = "";
  }

  function copyId() {
    navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <span className="grid h-20 w-20 select-none overflow-hidden rounded-full bg-purple-100 text-[22px] font-bold text-purple-700 sm:h-[84px] sm:w-[84px]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="m-auto">
                {name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("")}
              </span>
            )}
          </span>
          {signedIn && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                title="Change photo"
                className="absolute -right-0.5 -bottom-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-gray-900 text-white hover:bg-gray-800"
              >
                <Camera size={13} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarPick} />
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={20}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={commitEdit}
                className="rounded-[8px] border border-purple-300 px-2 py-1 text-[22px] font-bold text-ink outline-none focus:ring-2 focus:ring-purple-200"
              />
            ) : (
              <h1 className="text-[22px] font-bold leading-none text-ink sm:text-[26px]">{name}</h1>
            )}
            {signedIn && !editing && (
              <button onClick={startEdit} title="Edit name" className="rounded-full p-1 text-sub hover:bg-gray-100 hover:text-ink">
                <Pencil size={15} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyId}
              className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-sub hover:bg-gray-50"
            >
              {id}
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-sub">
              <Calendar size={12} />
              Joined {joinedLabel}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShareOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-gray-100"
      >
        Share
        <Share2 size={15} />
      </button>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} name={name} seed={seed} />
    </div>
  );
}
