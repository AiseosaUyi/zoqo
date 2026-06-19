import { ZoqoProvider } from "@/lib/store";
import { ProfileProvider } from "@/lib/profile";
import { SettlementToast } from "@/components/trade/SettlementToast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ZoqoProvider>
      <ProfileProvider>
        {children}
        <SettlementToast />
      </ProfileProvider>
    </ZoqoProvider>
  );
}
