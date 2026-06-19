import { redirect } from "next/navigation";

// next.config redirects / → /system for new visitors.
// This fallback ensures / always reaches the product if that redirect is ever removed.
export default function RootPage() {
  redirect("/trade");
}
