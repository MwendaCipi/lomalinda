import Link from "next/link";

/**
 * What we believe — six of the church's fundamental beliefs, with the short
 * Scripture reference each one stands on. The full list is linked out to the
 * Adventist world church's own statement, so nothing here can drift from it.
 */

const beliefs = [
  {
    title: "The Bible",
    text: "The Holy Scriptures are the inspired Word of God and our only rule of faith and practice.",
    reference: "2 Timothy 3:16, 17",
  },
  {
    title: "Salvation by grace",
    text: "Salvation is God's free gift, received by faith in Jesus — who lived, died and rose again for us.",
    reference: "John 3:16 · Ephesians 2:8",
  },
  {
    title: "The Sabbath",
    text: "The seventh-day Sabbath, from Friday sunset to Saturday sunset, is a gift of rest and communion with our Creator.",
    reference: "Genesis 2:2, 3 · Exodus 20:8-11",
  },
  {
    title: "Baptism",
    text: "Baptism by immersion marks a life given to Christ and a place in His church family.",
    reference: "Matthew 28:19 · Romans 6:4",
  },
  {
    title: "The Second Coming",
    text: "Jesus will return visibly and personally — the blessed hope of every believer — to make all things new.",
    reference: "Acts 1:11 · Revelation 22:12",
  },
  {
    title: "Health & wholeness",
    text: "Our bodies are God's temple, so we care for body, mind and spirit and serve others with compassion.",
    reference: "1 Corinthians 6:19, 20 · 3 John 2",
  },
];

export function ChurchBeliefs() {
  return (
    <section id="beliefs" className="px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">What we believe</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Rooted in Scripture, looking for Jesus to come
        </h2>
        <p className="mt-5 max-w-3xl text-base leading-8 text-[#617068]">
          We are a Seventh-day Adventist congregation, which simply means we keep the seventh-day Sabbath and
          live in the hope of Christ&apos;s return. These are the beliefs that shape our worship and our life
          together.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {beliefs.map((belief) => (
            <article
              key={belief.title}
              className="flex flex-col rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1]"
            >
              <h3 className="text-xl font-semibold tracking-tight">{belief.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-7 text-[#617068]">{belief.text}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#b36b3c]">
                {belief.reference}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[#dfdbd1] pt-8 text-sm font-semibold">
          <a
            href="https://www.adventist.org/beliefs/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#b36b3c] hover:underline"
          >
            Read the 28 Fundamental Beliefs &rarr;
          </a>
          <Link href="/materials" className="text-[#26352f] hover:text-[#b36b3c]">
            Sabbath School lessons &amp; materials &rarr;
          </Link>
          <Link href="/about" className="text-[#26352f] hover:text-[#b36b3c]">
            More about our church &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
