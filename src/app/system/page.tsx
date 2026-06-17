import type { Metadata } from "next";
import { SystemExplorer } from "@/components/system/SystemExplorer";

export const metadata: Metadata = {
  title: "ZOQO Design System",
  description:
    "Live, editable, exportable reference for the ZOQO design system — colors, typography, tokens and components.",
};

export default function SystemPage() {
  return <SystemExplorer />;
}
