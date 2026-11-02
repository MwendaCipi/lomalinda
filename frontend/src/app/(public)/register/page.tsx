import { CreateAccountPage } from "../create-account/page";

// `/register` is the address people reach for first; `/create-account` is what
// the site has always called the desk. Both render the one page, so the markup
// and metadata come from that side rather than being declared twice.
export { metadata } from "../create-account/page";

export default function RegisterPage() {
  return <CreateAccountPage />;
}
