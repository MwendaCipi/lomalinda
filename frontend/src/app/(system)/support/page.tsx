import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { stewardshipLinks } from "@/config/site-sections";

export default function SupportHubPage() {
  return (
    <main className="min-h-screen md:h-screen bg-white text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 w-full h-full md:h-full bg-white p-5 pb-28 sm:p-8 lg:p-10 border-b border-sand-line md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stewardship &amp; Support</h1>
              <p className="hidden sm:block mt-2 text-base text-moss">
                Faithfully supporting God&apos;s work through tithes, offerings, and transparent stewardship.
              </p>
            </div>

            {/* Desktop Section Overview Banner */}
            <div className="mt-8 hidden rounded-3xl bg-bark p-8 text-white shadow-sm lg:block">
              <span className="text-xs font-bold uppercase tracking-widest text-gold">Stewardship Hub</span>
              <h2 className="mt-2 text-2xl font-semibold">Supporting SDA Loma Linda</h2>
              <p className="mt-3 text-sm leading-6 text-white/80 max-w-2xl">
                Use the left navigation sidebar to give tithes and offerings online, offer in-kind gifts, follow fund drives, view published annual church budgets, or access financial transparency reports.
              </p>
              <div className="mt-6 flex gap-3">
                <Link href="/give" className="rounded-full bg-ember px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-ember-dark">
                  Give Now
                </Link>
                <Link href="/support/reports" className="rounded-full border border-white/30 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">
                  Reports
                </Link>
              </div>
            </div>

            {/* Mobile Cards View (hidden on desktop) — the same sections as the sidebar above.
                The two money sections lead because that is what members open first.
                Compact anatomy on purpose: the emoji-tile-left card used by the
                fellowship and materials hubs, not a tall poster card. */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:hidden">
              {stewardshipLinks.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.href}
                    href={section.href}
                    className="group flex items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-moss transition group-hover:bg-ember/15 group-hover:text-ember">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-bark">{section.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-moss">{section.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
