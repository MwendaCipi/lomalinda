import type { Metadata } from "next";
import { ChurchBeliefs } from "@/components/church-beliefs";
import { PublicSectionNav } from "@/components/public-section-nav";
import { aboutSectionLinks } from "@/config/site-sections";
import { openGraphFor } from "@/config/seo";

const BELIEFS_DESCRIPTION =
  "Explore the foundational biblical beliefs of Seventh-day Adventists at SDA Church Loma Linda, Meru.";

export const metadata: Metadata = {
  title: "Fundamental Beliefs",
  description: BELIEFS_DESCRIPTION,
  alternates: {
    canonical: "/beliefs",
  },
  openGraph: openGraphFor({
    title: "Fundamental Beliefs | SDA Church Loma Linda",
    description: BELIEFS_DESCRIPTION,
    path: "/beliefs",
  }),
};

/**
 * What we believe — one of the three places the public header names, beside
 * Calendar and Giving.
 *
 * It is the same six beliefs the landing page states, read as a page of their
 * own rather than a section of the home page: the header's "Beliefs" comes
 * here from any public page, where the landing's anchor would have nothing to
 * scroll to. The beliefs themselves live in one component, so the section and
 * this page cannot drift apart.
 */
export default function BeliefsPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <ChurchBeliefs asPage />

      <PublicSectionNav
        eyebrow="Explore"
        title="More about our church"
        description="Our story, our calendar, and working with us in ministry."
        links={aboutSectionLinks}
        activeKey="beliefs"
        className="border-t border-sand-line bg-white/60"
      />
    </main>
  );
}
