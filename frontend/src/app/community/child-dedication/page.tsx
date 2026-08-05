import Link from "next/link";

export default function ChildDedicationPage() {
  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-[#26352f] sm:py-16"><div className="mx-auto max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Child dedication</h1><p className="mt-6 text-lg leading-8 text-[#617068]">Begin a joyful conversation with the church about dedicating your child during worship.</p><p className="mt-5 text-sm leading-6 text-[#617068]">Please include the parent or guardian&apos;s name, phone number, and preferred contact method so the church office can help you plan the next steps.</p><a href="mailto:hello@lomalindachurch.org?subject=Child%20dedication" className="mt-7 inline-block rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white">Contact the church office &rarr;</a><Link href="/community" className="mt-6 block text-sm font-semibold text-[#b36b3c]">Back to Community</Link></div></main>;
}
