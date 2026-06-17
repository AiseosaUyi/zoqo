"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCopy } from "./useCopy";

/** Section wrapper with an anchor id, eyebrow, title and optional description. */
export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <header className="mb-6">
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-[30px] font-black leading-tight text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-sub">
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Small repeating sub-heading used inside sections. */
export function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-sub">
      {children}
    </h3>
  );
}

/** Icon copy button with built-in feedback. */
export function CopyButton({
  text,
  id,
  label = "Copy",
  className,
}: {
  text: string;
  id?: string;
  label?: string;
  className?: string;
}) {
  const { copy, isCopied } = useCopy();
  const cid = id ?? text;
  const done = isCopied(cid);
  return (
    <button
      type="button"
      onClick={() => copy(text, cid)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-gray-50",
        done && "border-green-300 text-green-700",
        className,
      )}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? "Copied!" : label}
    </button>
  );
}

/** Code block with header label + copy button. */
export function CodeBlock({
  code,
  language = "tsx",
  label,
}: {
  code: string;
  language?: string;
  label?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-line-strong bg-gray-900">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
          {label ?? language}
        </span>
        <CopyButtonDark text={code} />
      </div>
      <pre className="scroll-thin overflow-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono text-gray-100 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function CopyButtonDark({ text }: { text: string }) {
  const { copy, isCopied } = useCopy();
  const done = isCopied(text);
  return (
    <button
      type="button"
      onClick={() => copy(text, text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors",
        done
          ? "bg-green-500/20 text-green-300"
          : "bg-white/10 text-gray-200 hover:bg-white/20",
      )}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copied!" : "Copy"}
    </button>
  );
}

/** A labelled control row used in the component playground. */
export function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-sub">{label}</span>
      {children}
    </div>
  );
}

/** Minimal native select styled to match the system. */
export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-8 rounded-[8px] border border-line-strong bg-surface px-2 text-[12px] font-medium text-ink outline-none focus:border-purple-400"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
