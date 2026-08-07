import { ZoqoProvider } from "@/lib/store";
import { ProfileProvider } from "@/lib/profile";
import { SettlementToast } from "@/components/trade/SettlementToast";
import { AuthModal } from "@/components/trade/AuthModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ZoqoProvider>
      <ProfileProvider>
        {children}
        <SettlementToast />
        <AuthModal />
      </ProfileProvider>
    </ZoqoProvider>
  );
}
