import Link from "next/link";

const requestItems = [
  {
    href: "/spiritual/prayer",
    title: "Prayer requests",
    text: "Share what is on your heart and let our church family pray with you.",
    icon: "🙏",
  },
  {
    href: "/spiritual/child-dedication",
    title: "Child dedication requests",
    text: "Begin a conversation about dedicating your child during worship.",
    icon: "👶",
  },
  {
    href: "/enroll",
    title: "Membership requests",
    text: "Request to join Loma Linda SDA Church through baptism or membership transfer.",
    icon: "🤝",
  },
  {
    href: "/spiritual/visitation",
    title: "Request visitation",
    text: "Request church members, elders or pastor to visit or pray with you.",
    icon: "🏠",
  },
];

export default function RequestsPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Requests</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            Submit requests to Loma Linda SDA Church leadership, elders, and care team.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {requestItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
            >
              <div>
                <span className="text-2xl" aria-hidden="true">
                  {item.icon}
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">{item.text}</p>
              </div>
              <span className="mt-6 inline-block text-sm font-semibold text-[#b36b3c]">
                Open form &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
