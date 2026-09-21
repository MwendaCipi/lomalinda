/**
 * Mission and vision — the standing "who we are" band on the landing page.
 *
 * The mission and vision statements are the Seventh-day Adventist ones the
 * About page already carries, so the two pages say the same thing.
 */

const values = [
  {
    title: "Faith",
    text: "We follow Jesus, trust Scripture, and make room for questions, growth, and grace.",
  },
  {
    title: "Belonging",
    text: "Everyone should find a welcoming church family where they are known, valued, and remembered in prayer.",
  },
  {
    title: "Service",
    text: "We put faith into action by caring for our neighbours and responding to practical needs with compassion.",
  },
  {
    title: "Hope",
    text: "We share the hope of the gospel and encourage one another through every season of life.",
  },
];

export function ChurchMission() {
  return (
    <section id="mission" className="border-y border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Mission &amp; vision</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Why we are here, and where we are going
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] bg-[#26352f] p-8 text-white shadow-sm sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1c89e]">Our mission</p>
            <p className="mt-5 text-lg leading-8 text-white/85">
              Make disciples of Jesus Christ who live as His loving witnesses and proclaim to all people the
              everlasting gospel of the Three Angels&apos; Messages in preparation for His soon return.
            </p>
            <p className="mt-5 text-sm text-white/60">Matthew 28:18-20 · Acts 1:8 · Revelation 14:6-12</p>
          </article>

          <article className="rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Our vision</p>
            <p className="mt-5 text-lg leading-8 text-[#3d5148]">
              In harmony with Bible revelation, Seventh-day Adventists see as the climax of God&apos;s plan the
              restoration of all His creation to full harmony with His perfect will and righteousness.
            </p>
            <p className="mt-5 text-sm text-[#617068]">Revelation 21:1-5 · 2 Peter 3:13</p>
          </article>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => (
            <article key={value.title} className="border-l-2 border-[#b36b3c] pl-5">
              <h3 className="text-lg font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#617068]">{value.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
