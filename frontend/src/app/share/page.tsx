import Link from "next/link";

const items = [
  { href: "/spiritual/prayer", title: "Prayer box", text: "Share what is on your heart and let our church family pray with you." },
  { href: "/spiritual/visitation", title: "Request visitation", text: "Ask for a church member or pastor to visit or pray with you." },
  { href: "/spiritual/child-dedication", title: "Child dedication", text: "Begin a conversation about dedicating your child during worship." },
  { href: "/spiritual/testimonies", title: "Testimonies", text: "Share how God has been working in your life, or read stories of faith." },
];

export default function ShareCarePage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Care & Fellowship</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Share & Care</h1>
          <p className="mt-3 text-base leading-7 text-[#617068] sm:text-lg">
            Find care, prayer, pastoral visitation, testimonies, and practical ways to grow spiritually with the Loma Linda church family.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
            >
              <div>
                <h2 className="text-2xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">{item.text}</p>
              </div>
              <span className="mt-6 inline-block text-sm font-semibold text-[#b36b3c]">Explore &rarr;</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
