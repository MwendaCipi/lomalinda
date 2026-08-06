import Link from "next/link";

const items = [
  {
    href: "/spiritual/prayer",
    title: "Prayer box",
    text: "Share what is on your heart and let our church family pray with you.",
    icon: "🙏",
  },
  {
    href: "/spiritual/visitation",
    title: "Request visitation",
    text: "Request church members, elders or pastor to visit or pray with you.",
    icon: "🏠",
  },
  {
    href: "/spiritual/child-dedication",
    title: "Child dedication",
    text: "Begin a conversation about dedicating your child during worship.",
    icon: "👶",
  },
  {
    href: "/spiritual/testimonies",
    title: "Testimonies",
    text: "Share how God has been working in your life, or read stories of faith.",
    icon: "✨",
  },
  {
    href: "/share/moments",
    title: "Live Services & Moments",
    text: "Photos and videos of amazing fellowship moments, worship services, and church life.",
    icon: "📸",
    badge: "Live",
  },
];

export default function CareFellowshipPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Fellowship</h1>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {items.map((item) => (
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
