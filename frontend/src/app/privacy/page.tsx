import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-12 pt-8 text-[#26352f] sm:py-10 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-[#b36b3c] hover:underline">&larr; Back to Home</Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm leading-6 text-[#617068]">SDA Church Loma Linda, Meru</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-[#617068]">
          <section><h2 className="text-xl font-semibold text-[#26352f]">Who we are</h2><p className="mt-2">This website is operated by SDA Church Loma Linda, Meru, Kenya. We are responsible for the personal information submitted through our church forms and member services.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Information we collect</h2><p className="mt-2">Depending on the service you use, we may collect your name, surname, phone number, email address, ID number, date and county of birth, visitation location, prayer or testimony details, membership information, and giving information.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Why we use it</h2><p className="mt-2">We use this information to process membership and transfer requests, create and manage member accounts, arrange visitation and pastoral care, respond to prayer and testimony requests, administer giving, communicate church activities, and protect the security of our services.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Sharing and service providers</h2><p className="mt-2">Information is shared only with church workers who need it for these purposes and with service providers that help us host, secure, communicate through, or process payments for the website. We do not sell personal information.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Retention and security</h2><p className="mt-2">We retain information only for as long as it is reasonably needed for church administration, legal, accounting, safeguarding, or dispute-resolution purposes. We use access controls and other reasonable safeguards, but no online service can guarantee absolute security.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Your rights</h2><p className="mt-2">You may ask what personal information we hold about you, request correction of inaccurate information, ask us to delete information where appropriate, or raise a concern about how it is used. Contact us at <a className="font-semibold text-[#b36b3c] hover:underline" href="mailto:hello@lomalindachurch.org">hello@lomalindachurch.org</a>.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Children</h2><p className="mt-2">Where information concerns a child, it should be submitted by a parent or legal guardian, or with appropriate church safeguarding oversight.</p></section>
          <section><h2 className="text-xl font-semibold text-[#26352f]">Updates</h2><p className="mt-2">We may update this notice when our services or data practices change. The current version will remain available on this page.</p></section>
        </div>
      </article>
    </main>
  );
}
