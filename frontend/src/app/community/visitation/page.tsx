import Link from "next/link";

export default function VisitationPage() {
  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-[#26352f] sm:py-16"><div className="mx-auto max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Request visitation</h1><p className="mt-6 text-lg leading-8 text-[#617068]">Would you like a church member to visit or pray with you?</p><p className="mt-5 text-sm leading-6 text-[#617068]">Please include your name, phone number, preferred contact method, and a suitable time so the care team can follow up with you.</p><a href="mailto:hello@lomalindachurch.org?subject=Request%20visitation" className="mt-7 inline-block rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white">Contact the care team &rarr;</a><Link href="/community" className="mt-6 block text-sm font-semibold text-[#b36b3c]">Back to Community</Link></div></main>;
}
