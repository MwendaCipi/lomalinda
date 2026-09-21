import Link from "next/link";
import { EnrollmentForm } from "@/components/enrollment-form";

export const metadata = {
  title: "Create your account — SDA Loma Linda",
  description:
    "Create your SDA Loma Linda account as a church member or as a friend of the church, and get access to announcements, giving and events.",
};

export default function CreateAccountPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <header>
          <span className="text-xs font-bold uppercase tracking-widest text-[#b36b3c]">Join the church family</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Choose whether you are joining as a church member or as a friend of the church, then fill in your details.
            We will email you a link to verify your address and finish setting up your account.
          </p>
        </header>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
          <EnrollmentForm showAccountTypeChoice initialJoiningMode="membership_transfer" />
        </section>

        <p className="mt-6 text-center text-sm text-[#617068]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#b36b3c] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
