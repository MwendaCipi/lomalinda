import { AppFrame } from "@/components/app-frame";
import { MarketingNav } from "@/components/marketing-nav";
import { PublicSectionNav } from "@/components/public-section-nav";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";
import { publicWebsiteHeaderLinks } from "@/config/site-sections";

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
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <PublicSectionNav
          eyebrow="Explore"
          title="The church at a glance"
          description="Directions, worship times, what to expect on a Sabbath morning, and the pages a first-time visitor actually needs."
          links={publicWebsiteHeaderLinks}
          activeKey="top"
          className="mb-8"
        />
      </div>
      <AppFrame>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </AppFrame>
    </>
  );
}
