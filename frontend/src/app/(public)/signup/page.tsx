import { CreateAccountPage } from "../create-account/page";

// `/signup` is the shortest address people type for the same desk as
// `/create-account` and `/register`; all three render the one page.
export { metadata } from "../create-account/page";

export default function SignupPage() {
  return <CreateAccountPage />;
}
