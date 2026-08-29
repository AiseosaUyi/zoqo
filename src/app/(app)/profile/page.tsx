"use client";
import { ProfileTopNav } from "@/components/profile/ProfileTopNav";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PortfolioCards } from "@/components/profile/PortfolioCards";
import { PerformanceCards } from "@/components/profile/PerformanceCards";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/cn";

export default function ProfilePage() {
  const { ready, signedIn } = useProfile();

  return (
    <div className={cn("min-h-screen")}>
      <ProfileTopNav />
      {ready && (
        <div className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
          <ProfileHeader />
          {signedIn && <PortfolioCards />}
          <PerformanceCards />
          <ProfileTabs />
        </div>
      )}
    </div>
  );
}
