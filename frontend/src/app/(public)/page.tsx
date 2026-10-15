import { MarketingHome } from "@/components/marketing-home";

/**
 * Site home — the marketing page visitors land on.
 *
 * This page sets no metadata of its own on purpose: the root layout's
 * `defaultMetadata` already gives it the full title, description, canonical
 * URL and openGraph block, and a page that set its own would replace that
 * block wholesale rather than add to it.
 *
 * Signed-in members reach their system dashboard at /dashboard; the sign-in
 * button in the header points to /login.
 */
export default function HomePage() {
  return <MarketingHome />;
}
