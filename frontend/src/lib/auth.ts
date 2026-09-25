/**
 * What the app does with a sign-in answer.
 *
 * Both sign-in doors — username/password and Google — return the same body, so
 * storing the session and deciding where the member goes next happens here
 * rather than in each caller.
 */

export type SignInResponse = {
  access: string;
  refresh?: string;
  /** Set when an account was created with a shared password the member must replace. */
  must_change_password?: boolean;
  /** Set while sex, gifts, ministry and disability are still unanswered. */
  profile_update_pending?: boolean;
};

/** Remember the JWT pair the API returned; every page reads it back from here. */
export function storeSession(data: Pick<SignInResponse, "access" | "refresh">) {
  localStorage.setItem("access_token", data.access);
  if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
}

/**
 * Where a just-signed-in member belongs.
 *
 * An account owing a password change goes there first; one that still has to
 * answer the four profile questions lands on the profile form instead. Both
 * carry the destination the member asked for, so they arrive where they were
 * going once the detour is done. Everyone else goes straight there — defaulting
 * to the system dashboard, since the site home is the marketing page.
 */
export function destinationAfterSignIn(data: SignInResponse, next: string | null): string {
  const destination = next || "/dashboard";
  if (data.must_change_password) return `/change-password?next=${encodeURIComponent(destination)}`;
  if (data.profile_update_pending) return `/complete-profile?next=${encodeURIComponent(destination)}`;
  return destination;
}
