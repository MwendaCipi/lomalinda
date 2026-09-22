import Link from "next/link";
import { PublicSectionNav } from "@/components/public-section-nav";
import { aboutSectionLinks } from "@/config/site-sections";

const POLICY_VERSION = "22 September 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Legal &amp; safeguarding</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[#617068]">
            How SDA Loma Linda, Meru handles the information you share through our website and church services.
          </p>
          <p className="mt-3 text-xs font-semibold text-[#617068]">Policy version: {POLICY_VERSION}</p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <article className="mx-auto max-w-4xl rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
          <div className="space-y-7 text-sm leading-7 text-[#617068]">
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Who we are</h2>
              <p className="mt-2">This website is operated by SDA Loma Linda, Meru, Kenya. The church is responsible for the personal information submitted through its website, forms, member accounts and church services.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Information we collect</h2>
              <p className="mt-2">Depending on the service you use, we may collect your name, phone number, email address, account credentials, membership and transfer details, date and county of birth, visitation location, prayer or testimony details, ministry information, giving records and communications with the church.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">How we use information</h2>
              <p className="mt-2">We use information to create and manage accounts, process membership and transfer requests, arrange visitation and pastoral care, respond to prayer and testimony requests, administer giving, communicate church activities, provide requested resources, protect our services and meet legal, accounting and safeguarding responsibilities.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Payments and service providers</h2>
              <p className="mt-2">When you give, payment providers such as M-Pesa or Paystack may process payment details under their own terms and privacy notices. We may use hosting, email, mapping, security and communication providers to operate the service. We do not sell personal information.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Access, retention and security</h2>
              <p className="mt-2">Church workers receive access only where it is needed for their responsibilities. We retain information for as long as reasonably needed for church administration, legal, accounting, safeguarding or dispute-resolution purposes. We use access controls and other reasonable safeguards, but no online service can guarantee absolute security.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Your choices and rights</h2>
              <p className="mt-2">You may ask what personal information we hold about you, request correction of inaccurate information, ask us to delete information where appropriate, withdraw optional communications, or raise a concern about how information is used. Contact us at <a className="font-semibold text-[#b36b3c] hover:underline" href="mailto:hello@sdalomalinda.or.ke">hello@sdalomalinda.or.ke</a>.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Children and safeguarding</h2>
              <p className="mt-2">Information about a child should be submitted by a parent or legal guardian, or with appropriate church safeguarding oversight. Do not use public forms to share information that is not necessary for the request.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Policy changes</h2>
              <p className="mt-2">We may update this policy when our services or data practices change. The current version and its effective date remain available on this page. Where the law or our process requires renewed consent, we will ask for it.</p>
            </section>
            <section className="rounded-2xl bg-[#f7f4ee] p-4">
              <h2 className="text-base font-semibold text-[#26352f]">Related terms</h2>
              <p className="mt-1">Please also read our <Link href="/terms" className="font-semibold text-[#b36b3c] hover:underline">Terms of Use</Link>, which govern accounts, submissions, giving and use of the service.</p>
            </section>
          </div>
        </article>
      </section>

      <PublicSectionNav eyebrow="Explore" title="More about our church" description="Our story, our calendar, and working with us in ministry." links={aboutSectionLinks} activeKey="privacy" className="border-t border-[#dfdbd1] bg-white/60" />
    </main>
  );
}
