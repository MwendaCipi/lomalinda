import { AppFrame } from "@/components/app-frame";
import { MarketingNav } from "@/components/marketing-nav";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";

/**
 * Layout for the public website — the marketing side of the site.
 *
 * A visitor gets the marketing header (brand, page links, Sign in) and no
 * system chrome, so mobile browsers see a normal website. A *signed-in member*
 * roaming these pages gets the app's rail instead (see AppFrame): a section
 * like Giving or Materials is the same app as the dashboard, and navigation
 * must not change shape when they cross into it.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PopupAnnouncementModal />
      <MarketingNav />
      <AppFrame>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </AppFrame>
    </>
  );
}
