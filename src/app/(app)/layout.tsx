import { ZoqoProvider } from "@/lib/store";
import { ProfileProvider } from "@/lib/profile";
import { AcademyProvider } from "@/lib/academy";
import { SettlementToast } from "@/components/trade/SettlementToast";
import { AuthModal } from "@/components/trade/AuthModal";
import { MobileBottomNav } from "@/components/trade/MobileBottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ZoqoProvider>
      <ProfileProvider>
        <AcademyProvider>
          {children}
          <SettlementToast />
          <AuthModal />
          <MobileBottomNav />
        </AcademyProvider>
      </ProfileProvider>
    </ZoqoProvider>
  );
}
