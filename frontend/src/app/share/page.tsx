import Link from "next/link";

type FellowshipItem = {
  href: string;
  title: string;
  text: string;
  icon: string;
  badge?: string;
};

const fellowshipItems: FellowshipItem[] = [
  {
    href: "/calendar",
    title: "Calendar",
    text: "View upcoming Sabbath services, midweek vespers, and special church events.",
    icon: "📅",
  },
  {
    href: "/share/moments",
    title: "Live Services & Moments",
    text: "Watch worship services and explore photos & videos of fellowship moments.",
    icon: "📸",
  },
  {
    href: "/share/sabbath-school",
    title: "Sabbath School",
    text: "Access Adult Lesson, Children's Lesson, Adult Mission Story, and Children Mission Story.",
    icon: "📖",
  },
  {
    href: "/spiritual/testimonies",
    title: "Testimonies",
    text: "Share a testimony online or request an opportunity to share during fellowship.",
    icon: "✨",
  },
];

export default function FellowshipPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-6 pb-10 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>

        <div className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Fellowship</h1>
        </div>

        <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2">
          {fellowshipItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 sm:p-6 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
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
                <h2 className="mt-2 text-xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                  {item.title}
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm leading-5 text-[#617068]">{item.text}</p>
              </div>
              <span className="mt-4 inline-block text-xs sm:text-sm font-semibold text-[#b36b3c]">
                Explore &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
