"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DepartmentCalendar } from "@/components/department-calendar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ministryDetails: Record<string, { title: string; description: string; department?: string; sections?: { id?: string; title: string; text: string }[] }> = {
  "adventist-youth": { title: "Adventist Youth Ministries", description: "Helping young people grow in faith, friendship, leadership, and service.", department: "Adventist Youth Ministries" },
  "possibility-ministries": { title: "Adventist Possibility Ministries", description: "Building belonging and meaningful participation for people with disabilities and special needs.", department: "Adventist Possibility Ministries" },
  "adventist-men": { title: "Adventist men ministries", description: "Creating space for men to grow spiritually, build strong friendships, and serve the church and community.", department: "Adventist men ministries" },
  "adventist-women": { title: "Adventist Women Ministries", description: "Encouraging women through fellowship, discipleship, prayer, care, and outreach.", department: "Adventist Women Ministries" },
  ensemble: { title: "Loma Linda Ensemble", description: "Leading the church family in worship through music, harmony, and joyful service.", sections: [{ title: "Worship through music", text: "The Ensemble helps create a welcoming atmosphere for worship through songs that encourage faith, reflection, and praise." }, { title: "Growing together", text: "Members develop their musical gifts while building friendship, confidence, and a spirit of cooperation." }, { title: "Serving the church", text: "The Ensemble supports worship services and special gatherings, sharing music as a gift to the whole church family." }] },
  chaplaincy: { title: "Chaplaincy", description: "Offering a ministry of presence, comfort, prayer, and spiritual care in places of need.", sections: [{ title: "A ministry of presence", text: "Chaplaincy meets people where they are, offering compassionate listening, encouragement, and prayer without pressure." }, { title: "Care in difficult moments", text: "We seek opportunities to support people in hospitals, schools, workplaces, and other settings during seasons of uncertainty or change." }, { title: "Hope and dignity", text: "Every person deserves care, respect, and the freedom to be heard. Chaplaincy points to hope while honouring each person’s story." }] },
  evangelism: { title: "Evangelism", description: "Sharing the good news of Jesus through compassionate service, personal relationships, and public witness.", sections: [{ id: "community-outreach", title: "Community outreach", text: "We serve our neighbours through practical care, listening, prayer, and initiatives that respond to local needs." }, { title: "Chaplaincy", text: "We offer a ministry of presence, comfort, prayer, and spiritual care in hospitals, schools, workplaces, and other places of need." }, { id: "missions", title: "Missions", text: "We support mission work locally and beyond our community by sharing resources, skills, encouragement, and the hope of Jesus." }] },
};

export default function MinistryDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const ministry = ministryDetails[slug];
  const year = new Date().getFullYear();
  const [events, setEvents] = useState<{ date: string; name: string; department?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { if (ministry?.department) fetch(`${API_URL}/api/members/sabbath-events/`).then((response) => response.ok ? response.json() : []).then(setEvents).catch(() => setEvents([])).finally(() => setLoaded(true)); }, [ministry?.department]);
  if (!ministry) return <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#26352f]"><h1 className="text-3xl font-semibold">Ministry not found</h1><Link href="/ministries" className="mt-5 inline-block font-semibold text-[#b36b3c]">View all ministries &rarr;</Link></main>;
  return <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]"><div className="mx-auto max-w-5xl px-6 py-12 lg:px-8 lg:py-16"><Link href="/ministries" className="text-sm font-semibold text-[#b36b3c] hover:underline">&larr; All ministries</Link><div className="mt-10 max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{ministry.title}</h1><p className="mt-5 text-lg leading-8 text-[#617068]">{ministry.description}</p></div>{ministry.sections && <div className="mt-12 grid gap-5 md:grid-cols-3">{ministry.sections.map((section) => <section id={section.id} key={section.title} className="scroll-mt-28 rounded-2xl border border-[#dfdbd1] bg-white p-7"><h2 className="text-xl font-semibold">{section.title}</h2><p className="mt-4 text-sm leading-6 text-[#617068]">{section.text}</p></section>)}</div>}{ministry.department && <section className="mt-12"><h2 className="text-2xl font-semibold">{ministry.title} calendar</h2><DepartmentCalendar department={ministry.department} events={events} loaded={loaded} /><p className="mt-8 text-xs text-[#617068]">Showing events published for {year}. Church leaders can add more events through the church management tools.</p></section>}</div></main>;
}
