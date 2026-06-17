"use client";
import * as React from "react";
import {
  Card,
  Progress,
  Skeleton,
  Spinner,
  type ProgressColor,
  type SpinnerColor,
  type SpinnerSize,
} from "@/components/ui";
import { Section, Subhead } from "./primitives";

const SPINNER_SIZES: SpinnerSize[] = ["xs", "sm", "md", "lg"];
const SPINNER_COLORS: SpinnerColor[] = ["brand", "up", "down", "gray"];
const PROGRESS_COLORS: ProgressColor[] = ["brand", "up", "down", "gold", "blue"];

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-line bg-surface p-6 shadow-e1">{children}</div>
  );
}

function ProgressDemo() {
  const [value, setValue] = React.useState(40);
  React.useEffect(() => {
    const t = setInterval(() => setValue((v) => (v >= 100 ? 12 : v + 11)), 1200);
    return () => clearInterval(t);
  }, []);
  return (
    <Panel>
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-[12px] text-sub">
            <span>Determinate</span>
            <span className="nums font-semibold text-ink">{value}%</span>
          </div>
          <div className="flex flex-col gap-3">
            {PROGRESS_COLORS.map((c) => (
              <Progress key={c} value={value} color={c} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[12px] text-sub">Indeterminate</div>
          <Progress indeterminate color="brand" />
        </div>
        <div>
          <div className="mb-2 text-[12px] text-sub">Sizes (xs / sm / md / lg)</div>
          <div className="flex flex-col gap-2.5">
            <Progress value={value} size="xs" />
            <Progress value={value} size="sm" />
            <Progress value={value} size="md" />
            <Progress value={value} size="lg" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function LoadingSection() {
  return (
    <Section
      id="loading"
      eyebrow="Feedback"
      title="Loading"
      description="Placeholders and progress indicators — a shimmer Skeleton, a smooth SVG Spinner, and a linear Progress bar with an indeterminate mode. All themed via tokens with intentional 1.4–1.5s motion."
    >
      <Subhead>Skeleton</Subhead>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-4 text-[12px] text-sub">Shapes</div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Skeleton circle width={48} />
              <div className="flex-1">
                <Skeleton height={14} width="50%" />
                <div className="mt-2">
                  <Skeleton height={10} width="80%" />
                </div>
              </div>
            </div>
            <Skeleton height={40} rounded={10} />
            <Skeleton lines={3} />
          </div>
        </Panel>
        <Panel>
          <div className="mb-4 text-[12px] text-sub">Card skeleton</div>
          <Card padding="md">
            <Skeleton height={120} rounded={12} />
            <div className="mt-4 flex items-center gap-3">
              <Skeleton circle width={36} />
              <div className="flex-1">
                <Skeleton height={13} width="60%" />
                <div className="mt-2">
                  <Skeleton height={10} width="40%" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Skeleton lines={2} />
            </div>
          </Card>
        </Panel>
      </div>

      <Subhead>Spinner</Subhead>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-5 text-[12px] text-sub">Sizes (xs / sm / md / lg)</div>
          <div className="flex items-center gap-8">
            {SPINNER_SIZES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Spinner size={s} />
                <span className="text-[11px] text-sub">{s}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="mb-5 text-[12px] text-sub">Colors</div>
          <div className="flex items-center gap-8">
            {SPINNER_COLORS.map((c) => (
              <div key={c} className="flex flex-col items-center gap-2">
                <Spinner color={c} size="lg" />
                <span className="text-[11px] text-sub">{c}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Subhead>Progress</Subhead>
      <ProgressDemo />
    </Section>
  );
}
