import { PublicSectionNav } from "@/components/public-section-nav";
import { aboutSectionLinks } from "@/config/site-sections";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Privacy &amp; terms</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[#617068]">
            How SDA Loma Linda handles the information you share through our website and church services.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <article className="mx-auto max-w-4xl rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
          <div className="space-y-7 text-sm leading-7 text-[#617068]">
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Who we are</h2>
              <p className="mt-2">
                This website is operated by SDA Loma Linda, Meru, Kenya. We are responsible for the personal
                information submitted through our church forms and member services.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Information we collect</h2>
              <p className="mt-2">
                Depending on the service you use, we may collect your name, surname, phone number, email address, ID
                number, date and county of birth, visitation location, prayer or testimony details, membership
                information, and giving information.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Why we use it</h2>
              <p className="mt-2">
                We use this information to process membership and transfer requests, create and manage member
                accounts, arrange visitation and pastoral care, respond to prayer and testimony requests, administer
                giving, communicate church activities, and protect the security of our services.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Sharing and service providers</h2>
              <p className="mt-2">
                Information is shared only with church workers who need it for these purposes and with service
                providers that help us host, secure, communicate through, or process payments for the website. We do
                not sell personal information.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Retention and security</h2>
              <p className="mt-2">
                We retain information only for as long as it is reasonably needed for church administration, legal,
                accounting, safeguarding, or dispute-resolution purposes. We use access controls and other reasonable
                safeguards, but no online service can guarantee absolute security.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Your rights</h2>
              <p className="mt-2">
                You may ask what personal information we hold about you, request correction of inaccurate information,
                ask us to delete information where appropriate, or raise a concern about how it is used. Contact us at{" "}
                <a className="font-semibold text-[#b36b3c] hover:underline" href="mailto:hello@sdalomalinda.or.ke">
                  hello@sdalomalinda.or.ke
                </a>
                .
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Children</h2>
              <p className="mt-2">
                Where information concerns a child, it should be submitted by a parent or legal guardian, or with
                appropriate church safeguarding oversight.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-[#26352f]">Updates</h2>
              <p className="mt-2">
                We may update this notice when our services or data practices change. The current version will remain
                available on this page.
              </p>
            </section>
          </div>
        </article>
      </section>

      {/* The old About sidebar, now part of the page: the same four destinations. */}
      <PublicSectionNav
        eyebrow="Explore"
        title="More about our church"
        description="Our story, our calendar, and working with us in ministry."
        links={aboutSectionLinks}
        activeKey="privacy"
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
