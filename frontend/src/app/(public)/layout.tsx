import { MarketingNav } from "@/components/marketing-nav";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";

/**
 * Layout for the public website — the marketing side of the site.
 *
 * A visitor gets the marketing header (brand, page links, Sign in) and no
 * system chrome, so mobile browsers see a normal website. A signed-in member
 * roaming these pages keeps the marketing header too — beliefs, About, Support
 * Us and the rest are the church's public site, not their desk. The member's
 * own desk for the same topics lives under /member/... (the Giving desk, say),
 * which is rendered by the system layout with the rail.
 *
 * The marketing pages never render the app rail, so navigation never changes
 * shape under a signed-in reader on /beliefs, /about, /give and the rest.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PopupAnnouncementModal />
      <MarketingNav />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
