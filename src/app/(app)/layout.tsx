import { ZoqoProvider } from "@/lib/store";
import { ProfileProvider } from "@/lib/profile";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ZoqoProvider>
      <ProfileProvider>{children}</ProfileProvider>
    </ZoqoProvider>
  );
}
