import { SiteNav } from "@/components/site-nav";

const schedules = [
  { day: "Wednesday", title: "Online Prayer Meeting", time: "8:00 PM – 9:00 PM", location: "Online", description: "Connect mid-week with our church family for prayer, scripture, and mutual encouragement.", badge: "Virtual Gathering" },
  { day: "Friday", title: "Friday Vespers", time: "5:30 PM – 6:30 PM", location: "At Church Sanctuary", description: "Welcome the holy Sabbath together with song, reflection, and peaceful worship.", badge: "In-Person" },
  { day: "Sabbath (Saturday)", title: "Sabbath Worship & Programs", time: "8:00 AM – 4:00 PM", location: "At Church Campus", description: "Join us for Sabbath School, Divine Service, Fellowship Meal, and afternoon community programs.", badge: "Main Service" },
];

const ministries = [
  { title: "Worship & Praise", text: "Experience uplifting music, prayer, and Bible-centered teaching every Sabbath." },
  { title: "Prayer & Support", text: "Join our Wednesday online prayer sessions or reach out for personal prayer support." },
  { title: "Youth & Community", text: "Engaging programs for kids, youth, and families to grow together in faith." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <SiteNav />

      <section id="top" className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:pt-12">
        <div>
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Loma Linda Seventh-day Adventist Church</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight sm:text-6xl">We love you.<br />We value you.<br />And we&apos;ll always pray for you.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#617068]">We are a welcoming Seventh-day church family learning to follow Jesus, care for our neighbors, and live with hope.</p>
          <div className="mt-9 flex flex-wrap gap-4"><a href="#schedule" className="rounded-full bg-[#b36b3c] px-6 py-3.5 font-medium text-white transition hover:bg-[#96552e]">Join us this Sabbath</a><a href="#about" className="rounded-full border border-[#c9c5bb] px-6 py-3.5 font-medium transition hover:border-[#26352f]">Learn more</a></div>
        </div>

        <div className="relative min-h-80 overflow-hidden rounded-[2rem] bg-[#d5dfd7] p-10 text-[#26352f] shadow-sm ring-1 ring-[#c9d5ca] sm:min-h-[28rem]">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#e7b783]/60 blur-xl" />
          <div className="relative z-10 flex h-full flex-col">
            <div><span className="inline-block rounded-full bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#b36b3c]">Sabbath Gathering</span><h2 className="mt-5 text-3xl font-semibold">Every Sabbath</h2><p className="mt-3 text-lg text-[#3d5148]">8:00 AM – 4:00 PM</p><p className="mt-1 text-sm text-[#617068]">Loma Linda Church Campus</p></div>
            <div className="mt-auto pt-12"><div className="rounded-2xl bg-white/75 p-6 shadow-sm backdrop-blur-md"><p className="text-xs font-semibold uppercase tracking-widest text-[#b36b3c]">Weekly Highlights</p><p className="mt-3 text-sm leading-6 text-[#3d5148]">• <strong>Wed:</strong> Online Prayer (8–9 PM)<br />• <strong>Fri:</strong> Vespers at Church (5:30–6:30 PM)<br />• <strong>Sat:</strong> Full Day Sabbath Program (8 AM–4 PM)</p></div></div>
          </div>
        </div>
      </section>

      <section id="about" className="border-y border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8"><div className="mx-auto max-w-6xl"><p className="max-w-3xl text-2xl leading-relaxed tracking-tight sm:text-3xl">As a Seventh-day church, we honor the Sabbath, cherish Bible truth, and build a supportive community where everyone feels loved, valued, and remembered in prayer.</p></div></section>

      <section id="schedule" className="mx-auto max-w-6xl px-6 py-20 lg:px-8"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Weekly Schedule</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Connect & Worship With Us</h2></div><div className="mt-10 grid gap-6 md:grid-cols-3">{schedules.map((item) => <article key={item.title} className="flex flex-col justify-between rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-md"><div><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#b36b3c]">{item.day}</span><span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-medium text-[#26352f]">{item.badge}</span></div><h3 className="mt-4 text-2xl font-semibold">{item.title}</h3><p className="mt-2 font-medium text-[#26352f]">{item.time}</p><p className="mt-0.5 text-xs font-medium text-[#b36b3c]">{item.location}</p><p className="mt-4 text-sm leading-6 text-[#617068]">{item.description}</p></div></article>)}</div></section>

      <section id="ministries" className="bg-[#eef2ed] px-6 py-20 lg:px-8"><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Grow & Serve</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Our Ministries</h2><div className="mt-10 grid gap-6 md:grid-cols-3">{ministries.map((ministry) => <article key={ministry.title} className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm"><h3 className="text-xl font-semibold">{ministry.title}</h3><p className="mt-3 text-sm leading-6 text-[#617068]">{ministry.text}</p></article>)}</div></div></section>

      <footer id="contact" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-12 text-sm text-[#617068] sm:flex-row sm:items-center sm:justify-between lg:px-8"><p>© 2026 Loma Linda Seventh-day Church</p><p>Questions & Prayer Requests: <a className="font-medium text-[#26352f] underline hover:text-[#b36b3c]" href="mailto:hello@lomalindachurch.org">hello@lomalindachurch.org</a></p></footer>
    </main>
  );
}
