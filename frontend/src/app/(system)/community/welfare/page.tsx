import Link from "next/link";

const activities = [
  "Visiting and checking in on members who need encouragement",
  "Coordinating practical help during illness, bereavement, or hardship",
  "Connecting families with prayer, counselling, and trusted community resources",
  "Organising care initiatives and support for vulnerable neighbours",
];

const benefits = [
  "A caring community that listens and walks with you",
  "Practical support during difficult seasons",
  "Opportunities to serve, encourage, and build meaningful relationships",
  "A stronger church family where no one has to face hardship alone",
];

export default function ChurchWelfarePage() {
  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">

        <div className="flex-1 min-w-0 h-full md:h-full p-4 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-3xl border border-sand-line bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold">What we do</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-moss">
                  {activities.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ember" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-sand-line bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-semibold">Why it matters</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-moss">
                  {benefits.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sage" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="rounded-3xl bg-bark p-6 text-white shadow-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Get In Touch</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Need welfare support or want to assist?</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
                Reach out to our welfare leaders for confidential assistance, or join our volunteer team to support church members.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  href="/community/prayer"
                  className="rounded-full bg-ember px-6 py-3 text-xs sm:text-sm font-semibold text-white transition hover:bg-ember-dark"
                >
                  Request care or visit
                </Link>
                <Link
                  href="/give"
                  className="rounded-full border border-white/30 px-6 py-3 text-xs sm:text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Support welfare fund
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
