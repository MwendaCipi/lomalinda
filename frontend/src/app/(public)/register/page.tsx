import Link from "next/link";
import { EnrollmentForm } from "@/components/enrollment-form";

// `/register` is the address people reach for first; `/create-account` is
// what the site has always called the desk. Both render the one page, so the
// metadata comes from that side rather than being declared twice.
export { metadata } from "../create-account/page";
export default RegisterPage;

function RegisterPage() {
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
