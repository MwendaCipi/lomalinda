import Link from "next/link";

export default function HymnalPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-10 pt-6 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span><span>Back to Fellowship</span>
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">SDA Hymnal</h1>
        <section className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mt-4 text-2xl font-semibold">Songs for worship</h2>
          <p className="mt-2 text-sm leading-6 text-[#617068]">Browse the Seventh-day Adventist hymnal online for worship, devotion, and Sabbath School.</p>
          <a href="https://www.sdahymnal.org/" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]">
            Open SDA Hymnal <span>&rarr;</span>
          </a>
        </section>
      </div>
    </main>
  );
}
