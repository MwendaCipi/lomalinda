import { AppFrame } from "@/components/app-frame";
import { MarketingNav } from "@/components/marketing-nav";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";
import { ThoughtOfTheDayModal } from "@/components/thought-of-the-day-modal";

/**
 * Layout for the public website — the marketing side of the site.
 *
 * A visitor gets the marketing header (brand, page links, Sign in) and no
 * system chrome, so mobile browsers see a normal website.
 *
 * A signed-in member gets the chrome of the side the page belongs to, and
 * never both. The church's own pages — beliefs, About, Support Us, the landing
 * page — are the public site, read the same way whoever reads them: AppFrame
 * leaves them bare (`isMarketingPage`) and the marketing header stays.
 *
 * The public pages the app also opens from its own links — Calendar, Requests,
 * Materials, the Fellowship hub — are places in the app: AppFrame draws the
 * rail and the tab bar around them and the marketing header steps aside. Those
 * pages therefore keep one shape each: a visitor reads the marketing page, a
 * member gets the app's own desk for the same destination (the calendar's
 * controls ride the shell header, Materials hands its shelf strip to the
 * shell, and so on). `isMarketingPage` is the single list that decides which
 * side a page is on, so the two headers can never both appear or both hide.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PopupAnnouncementModal />
      <ThoughtOfTheDayModal />
      <MarketingNav />
      <AppFrame>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </AppFrame>
    </>
  );
}
