import Link from "next/link";

const announcements = [
  { title: "Sabbath worship", text: "Join us every Saturday for worship, fellowship, and a place to belong.", detail: "Our weekly Sabbath gathering is a time for Bible study, worship, prayer, and fellowship across generations.", href: "/calendar?month=all&search=Sabbath" },
  { title: "Midweek Vespers", text: "Pause in the middle of the week for prayer and encouragement online.", detail: "Make space for prayer and spiritual encouragement with the church family during the week.", href: "/calendar?month=all&search=Midweek%20Vespers" },
  { title: "Serve with us", text: "Explore ministries, outreach, and practical ways to care for our community.", detail: "There is a place for every gift. Discover ways to serve through ministries, Evangelism, and Church welfare.", href: "/ministries" },
];

export default function AnnouncementsPage() {
  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-[#26352f] sm:py-16"><div className="mx-auto max-w-5xl"><div className="max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Announcements</h1><p className="mt-5 text-lg leading-8 text-[#617068]">Stay connected with what is happening in the Loma Linda church family.</p></div><div className="mt-12 grid gap-6">{announcements.map((announcement) => <article key={announcement.title} className="rounded-2xl border border-[#dfdbd1] bg-white p-7 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b36b3c]">Announcement</p><h2 className="mt-3 text-2xl font-semibold">{announcement.title}</h2><p className="mt-4 text-base leading-7 text-[#26352f]">{announcement.text}</p><p className="mt-3 max-w-2xl text-sm leading-6 text-[#617068]">{announcement.detail}</p><Link href={announcement.href} className="mt-5 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Learn more &rarr;</Link></article>)}</div></div></main>;
}
