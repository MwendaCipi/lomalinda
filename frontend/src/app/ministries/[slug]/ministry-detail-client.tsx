"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DepartmentCalendar } from "@/components/department-calendar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ministryDetails: Record<
  string,
  { title: string; description: string; department?: string; sections?: { id?: string; title: string; text: string }[] }
> = {
  "adventist-youth": {
    title: "Adventist Youth Ministries",
    description: "Helping young people grow in faith, friendship, leadership, and service.",
    department: "Adventist Youth Ministries",
  },
  "possibility-ministries": {
    title: "Adventist Possibility Ministries",
    description: "Building belonging and meaningful participation for people with disabilities and special needs.",
    department: "Adventist Possibility Ministries",
  },
  "adventist-men": {
    title: "Adventist Men Ministries",
    description: "Creating space for men to grow spiritually, build strong friendships, and serve the church and community.",
    department: "Adventist men ministries",
  },
  "adventist-women": {
    title: "Adventist Women Ministries",
    description: "Encouraging women through fellowship, discipleship, prayer, care, and outreach.",
    department: "Adventist Women Ministries",
  },
  "personal-ministries": {
    title: "Personal Ministries",
    description: "Equipping every church member for active personal witnessing, Bible studies, and community evangelism.",
    department: "Personal Ministries",
    sections: [
      { title: "Member Witnessing Training", text: "Providing practical tools and resources to help members share their faith confidently in daily life." },
      { title: "Bible Study & Discipleship", text: "Organizing neighborhood small groups and personal Bible studies for seekers." },
      { title: "Community Care & Missions", text: "Coordinating active local outreach, welfare support, and sharing literature." },
    ],
  },
  "adventist-muslim-relations": {
    title: "Adventist Muslim Relations",
    description: "Building respectful bridges of understanding, dialogue, friendship, and shared truth with Muslim neighbors.",
    department: "Adventist Muslim Relations",
    sections: [
      { title: "Bridge Building & Dialogue", text: "Fostering mutual respect, peaceful understanding, and friendly conversations on shared values." },
      { title: "Community Friendship", text: "Engaging in joint community service, hospitality, and neighborly care." },
      { title: "Sharing Hope", text: "Presenting spiritual truth with gentleness, clarity, and respect." },
    ],
  },
  ensemble: {
    title: "Loma Linda Ensemble",
    description: "Leading the church family in worship through music, harmony, and joyful service.",
    sections: [
      { title: "Worship through music", text: "The Ensemble helps create a welcoming atmosphere for worship through songs that encourage faith, reflection, and praise." },
      { title: "Growing together", text: "Members develop their musical gifts while building friendship, confidence, and a spirit of cooperation." },
      { title: "Serving the church", text: "The Ensemble supports worship services and special gatherings, sharing music as a gift to the whole church family." },
    ],
  },
  chaplaincy: {
    title: "Chaplaincy",
    description: "Offering a ministry of presence, comfort, prayer, and spiritual care in places of need.",
    sections: [
      { title: "A ministry of presence", text: "Chaplaincy meets people where they are, offering compassionate listening, encouragement, and prayer without pressure." },
      { title: "Care in difficult moments", text: "We seek opportunities to support people in hospitals, schools, workplaces, and other settings during seasons of uncertainty or change." },
      { title: "Hope and dignity", text: "Every person deserves care, respect, and the freedom to be heard. Chaplaincy points to hope while honouring each person’s story." },
    ],
  },
};

export default function MinistryDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const ministry = ministryDetails[slug];
  const year = new Date().getFullYear();
  const [events, setEvents] = useState<{ date: string; name: string; department?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ministry?.department)
      fetch(`${API_URL}/api/members/sabbath-events/`)
        .then((response) => (response.ok ? response.json() : []))
        .then(setEvents)
        .catch(() => setEvents([]))
        .finally(() => setLoaded(true));
  }, [ministry?.department]);

  if (!ministry)
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-center text-[#26352f]">
        <h1 className="text-2xl font-semibold">Ministry not found</h1>
        <Link href="/ministries" className="mt-4 inline-block font-semibold text-[#b36b3c]">
          &larr; View all ministries
        </Link>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8 lg:py-10">
        {/* Back Button */}
        <Link
          href="/ministries"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Ministries</span>
        </Link>

        <div className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{ministry.title}</h1>
          <p className="mt-3 text-base leading-7 text-[#617068] sm:text-lg">{ministry.description}</p>
        </div>

        {ministry.sections && (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {ministry.sections.map((section) => (
              <section id={section.id} key={section.title} className="scroll-mt-28 rounded-2xl border border-[#dfdbd1] bg-white p-6 sm:p-7">
                <h2 className="text-lg font-semibold sm:text-xl">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">{section.text}</p>
              </section>
            ))}
          </div>
        )}

        {ministry.department && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold sm:text-2xl">{ministry.title} calendar</h2>
            <DepartmentCalendar department={ministry.department} events={events} loaded={loaded} />
            <p className="mt-6 text-xs text-[#617068]">Showing events published for {year}.</p>
          </section>
        )}
      </div>
    </main>
  );
}
