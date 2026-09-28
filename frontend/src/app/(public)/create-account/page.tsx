import Link from "next/link";
import { EnrollmentForm } from "@/components/enrollment-form";

export const metadata = {
  title: "Create your account — SDA Loma Linda",
  description:
    "Create your SDA Loma Linda account as a church member, a friend of the church, a baptism candidate or a Sabbath School attendee, and get access to announcements, giving and events.",
};

export default function CreateAccountPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-moss">
            Create your account to become part of Loma Linda church management system. Fill in your details below.
          </p>
        </header>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:p-8">
          <EnrollmentForm showAccountTypeChoice initialJoiningMode="membership_transfer" />
        </section>

        <p className="mt-6 text-center text-sm text-moss">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ember hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
