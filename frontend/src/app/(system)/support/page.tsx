import Link from "next/link";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";
import { stewardshipLinks } from "@/config/site-sections";

export default function SupportHubPage() {
  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 pb-28 sm:p-8 lg:p-10 border-b border-[#dfdbd1] md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stewardship &amp; Support</h1>
              <p className="hidden sm:block mt-2 text-base text-[#617068]">
                Faithfully supporting God&apos;s work through tithes, offerings, and transparent stewardship.
              </p>
            </div>

            {/* Desktop Section Overview Banner */}
            <div className="mt-8 hidden rounded-3xl bg-[#26352f] p-8 text-white shadow-sm lg:block">
              <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">Stewardship Hub</span>
              <h2 className="mt-2 text-2xl font-semibold">Supporting SDA Loma Linda</h2>
              <p className="mt-3 text-sm leading-6 text-white/80 max-w-2xl">
                Use the left navigation sidebar to give tithes and offerings online, offer in-kind gifts, follow fund drives, view published annual church budgets, or access financial transparency reports.
              </p>
              <div className="mt-6 flex gap-3">
                <Link href="/give" className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#96552e]">
                  Give Now
                </Link>
                <Link href="/support/reports" className="rounded-full border border-white/30 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">
                  Live Reports
                </Link>
              </div>
            </div>

            {/* Mobile Cards View (hidden on desktop) — the same sections as the sidebar above */}
            <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 lg:hidden">
              {stewardshipLinks.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.href}
                    href={section.href}
                    className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 sm:p-6 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
                  >
                    <div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f4ee] group-hover:bg-[#f1c89e]/20">
                        <Icon className="h-6 w-6 text-[#b36b3c]" />
                      </div>
                      <h2 className="mt-3 text-xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                        {section.label}
                      </h2>
                      <p className="mt-1.5 text-xs sm:text-sm leading-5 text-[#617068]">
                        {section.description}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#b36b3c]">
                      <span>Open category</span>
                      <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
                    </div>
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
