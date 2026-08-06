import Link from "next/link";

const fellowshipItems = [
  {
    href: "/share/services",
    title: "Live Services",
    text: "Watch or catch up on Sabbath worship, vespers, and special programmes from Loma Linda.",
    icon: "📡",
    badge: "Live",
  },
  {
    href: "/share/moments",
    title: "Moments",
    text: "Photos and videos of amazing fellowship moments, outings, and church life.",
    icon: "📸",
  },
  {
    href: "/calendar",
    title: "Calendar",
    text: "View upcoming Sabbath services, midweek vespers, and special church events.",
    icon: "📅",
  },
  {
    href: "/spiritual/testimonies",
    title: "Testimonies",
    text: "Share how God has been working in your life, or read stories of faith.",
    icon: "✨",
  },
];

export default function FellowshipPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] sm:py-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>

        <div className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Fellowship</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            Connect, grow, and celebrate faith together with the Loma Linda church family.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {fellowshipItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                  {item.badge && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[#b36b3c]/10 px-3 py-1 text-xs font-semibold text-[#b36b3c]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b36b3c] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#b36b3c]" />
                      </span>
                      {item.badge}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">{item.text}</p>
              </div>
              <span className="mt-6 inline-block text-sm font-semibold text-[#b36b3c]">
                Explore &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
