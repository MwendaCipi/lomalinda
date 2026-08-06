"use client";

import Link from "next/link";

const ministries = [
  { slug: "adventist-youth", title: "Adventist Youth Ministries", description: "Helping young people grow in faith, friendship, leadership, and service." },
  { slug: "possibility-ministries", title: "Adventist Possibility Ministries", description: "Building belonging and meaningful participation for people with disabilities and special needs." },
  { slug: "adventist-men", title: "Adventist Men Ministries", description: "Creating space for men to grow spiritually, build strong friendships, and serve the church and community." },
  { slug: "adventist-women", title: "Adventist Women Ministries", description: "Encouraging women through fellowship, discipleship, prayer, care, and outreach." },
  { slug: "personal-ministries", title: "Personal Ministries", description: "Equipping every church member for active personal witnessing, Bible studies, and community evangelism." },
  { slug: "adventist-muslim-relations", title: "Adventist Muslim Relations", description: "Building respectful bridges of understanding, dialogue, friendship, and shared truth with Muslim neighbors." },
  { slug: "ensemble", title: "Church Choir", description: "Leading the church family in worship through music, harmony, and joyful service." },
  { slug: "chaplaincy", title: "Chaplaincy", description: "Offering a ministry of presence, comfort, prayer, and spiritual care in places of need." },
];

export default function MinistriesPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8 lg:py-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our ministries</h1>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {ministries.map((ministry) => (
            <Link
              key={ministry.slug}
              href={`/ministries/${ministry.slug}`}
              className="rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm sm:p-7"
            >
              <h2 className="text-xl font-semibold sm:text-2xl">{ministry.title}</h2>
              <p className="mt-2.5 text-sm leading-6 text-[#617068]">{ministry.description}</p>
              <span className="mt-5 inline-block text-sm font-semibold text-[#b36b3c]">Explore {ministry.title} &rarr;</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
