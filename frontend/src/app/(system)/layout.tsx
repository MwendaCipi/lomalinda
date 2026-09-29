import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";
import { SystemGate } from "@/components/system-gate";

// Sections behind the sign-in wall are not for search engines. `robots` is
// prerendered into the static HTML of every page in this group.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * The system area: the app itself.
 *
 * There is no top bar here any more — `AppFrame` draws the rail (and, on a
 * phone, the tab bar that opens it), and the rail carries the identity
 * controls the bar used to: the bell, the account menu and sign-out.
 */
export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PopupAnnouncementModal />
      <AppFrame>
        <SystemGate>{children}</SystemGate>
      </AppFrame>
    </>
  );
}
