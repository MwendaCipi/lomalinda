import Link from "next/link";
import { PublicSectionNav } from "@/components/public-section-nav";
import { LegalDocument } from "@/components/legal-document";
import { aboutSectionLinks } from "@/config/site-sections";

const TERMS_VERSION = "22 September 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Legal &amp; safeguarding</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Use</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[#617068]">The rules for using SDA Loma Linda’s website, accounts, forms and digital church services.</p>
          <p className="mt-3 text-xs font-semibold text-[#617068]">Terms version: {TERMS_VERSION}</p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <article className="mx-auto max-w-4xl rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
          {/* The church's own terms once it has written them; the built-in
              wording below is the fallback and the pre-hydration content. */}
          <LegalDocument field="terms_of_use">
          <div className="space-y-7 text-sm leading-7 text-[#617068]">
            <section><h2 className="text-xl font-semibold text-[#26352f]">Acceptance</h2><p className="mt-2">By using this website or creating an account, you agree to these Terms of Use and our <Link href="/privacy" className="font-semibold text-[#b36b3c] hover:underline">Privacy Policy</Link>. If you do not agree, please do not create an account or submit information.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Accounts and passwords</h2><p className="mt-2">Provide accurate information, keep your username and password private, and notify the church if you suspect unauthorized access. You are responsible for activity performed through your account. Administrators may suspend or close accounts that violate these terms, create a security risk or contain materially false information.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Acceptable use</h2><p className="mt-2">Use the service lawfully and respectfully. Do not impersonate another person, probe or disrupt the service, bypass access controls, upload malicious material, harvest information, misuse church forms, or submit content that is abusive, threatening, discriminatory, defamatory or unrelated to the form’s purpose.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Church submissions</h2><p className="mt-2">You are responsible for the accuracy and appropriateness of prayer requests, testimonies, visitation requests, membership information and other submissions. By submitting content, you allow the church to use it to respond to the request and carry out church administration. We may moderate, restrict or remove content when necessary for safety, privacy or service operation.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Giving and payments</h2><p className="mt-2">Giving instructions and payment confirmations are provided for convenience. A payment is subject to the relevant payment provider’s processing rules, and a displayed status may change while a transaction is being confirmed. Keep your receipt or transaction reference and contact the church promptly about an apparent error. Giving does not create a contract for a particular service or outcome.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Church content</h2><p className="mt-2">Church names, logos, original text, graphics and other materials belong to SDA Loma Linda or their respective rights holders. You may use content for personal, non-commercial church participation, but may not copy, alter, redistribute or commercially exploit it without permission. External resources remain subject to their own terms.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Availability and liability</h2><p className="mt-2">We aim to keep the service accurate, secure and available, but it may occasionally be unavailable, delayed or contain errors. The website and external links are provided on an “as available” basis. Nothing in these terms limits rights or responsibilities that cannot legally be limited under applicable law.</p></section>
            <section><h2 className="text-xl font-semibold text-[#26352f]">Changes and contact</h2><p className="mt-2">We may update these terms as the service changes. The current version and effective date will remain on this page. Questions or concerns can be sent to <a className="font-semibold text-[#b36b3c] hover:underline" href="mailto:hello@sdalomalinda.or.ke">hello@sdalomalinda.or.ke</a>.</p></section>
            <section className="rounded-2xl bg-[#f7f4ee] p-4"><p>These terms are a practical starting point for the church’s digital service and should be reviewed by a qualified Kenyan legal or privacy professional before being relied on as final legal advice.</p></section>
          </div>
          </LegalDocument>
        </article>
      </section>

      <PublicSectionNav eyebrow="Explore" title="More about our church" description="Our story, our calendar, and working with us in ministry." links={aboutSectionLinks} activeKey="terms" className="border-t border-[#dfdbd1] bg-white/60" />
    </main>
  );
}
