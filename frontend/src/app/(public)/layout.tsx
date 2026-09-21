import { AuthenticatedPublicShell } from "@/components/authenticated-public-shell";
import { MarketingNav } from "@/components/marketing-nav";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";

/**
 * Layout for the public website — the marketing side of the site.
 *
 * Everything in this group is visitor-facing: it gets the marketing header
 * (brand, page links, Sign in) and no system chrome, so mobile browsers see a
 * normal website without the app's bottom tab bar.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PopupAnnouncementModal />
      <MarketingNav />
      <AuthenticatedPublicShell>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </AuthenticatedPublicShell>
    </>
  );
}
