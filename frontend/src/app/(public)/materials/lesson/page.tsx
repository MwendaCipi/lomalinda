import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

import { LessonReader } from "@/components/lesson-reader";

export const metadata = {
  title: "Sabbath School Lesson Guide",
  description:
    "The official Seventh-day Adventist Adult Bible Study Guide, read in the app with daily studies, memory texts, and personal notes.",
};

export default function LessonPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-10 lg:px-8">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Study Materials</span>
            </Link>
            <Link href="/materials/bible/read" className="text-xs font-medium text-moss hover:text-ember">
              Holy Bible
            </Link>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember text-white">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-ember">
              Sabbath School
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl font-serif">
            Adult Bible Study Guide
          </h1>
          <p className="mt-2 text-sm text-moss max-w-2xl">
            Read today&apos;s lesson in the app with daily studies, scripture texts, and space to take notes
            for your Sabbath School class discussion.
          </p>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="max-w-4xl">
          <LessonReader />
        </div>
      </section>
    </main>
  );
}
