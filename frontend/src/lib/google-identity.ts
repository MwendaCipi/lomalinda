/**
 * Google Identity Services, loaded once per page.
 *
 * The login page and the enrollment form both ask Google for the same thing —
 * a signed ID token proving which Google account is at the keyboard — and both
 * need the same script and the same callback shape, so the loader and the
 * global typings live here instead of in each component.
 *
 * No redirect URI is involved: GIS hands the browser a `credential` for this
 * page to POST to the API, which keeps the flow working on every tenant
 * hostname the app is served from.
 */

export type GoogleCredentialResponse = { credential: string };

/** Public by design — it names the client, it is not a secret. Absent means the feature is off. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const GOOGLE_SIGN_IN_ENABLED = Boolean(GOOGLE_CLIENT_ID);

type GoogleButtonOptions = {
  type?: string;
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: string;
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  /** Pixels, 200–400; Google refuses anything outside that range. */
  width?: number;
};

type GoogleAccountsId = {
  initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  /** The One Tap prompt; used where the member is already mid-form. */
  prompt: () => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        // Let a later attempt try again rather than cache the failure.
        scriptPromise = null;
        reject(new Error("Google sign-in is unavailable."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Google's client, or null when it is unusable.
 *
 * Null covers both "this deployment has no client ID" and "the script would not
 * load" — neither can be retried into working, and callers treat both the same
 * way: no Google option at all, rather than one that looks clickable and fails.
 */
export async function googleAccountsId(): Promise<GoogleAccountsId | null> {
  if (!GOOGLE_CLIENT_ID) return null;
  try {
    await loadGoogleIdentityScript();
  } catch {
    return null;
  }
  return window.google?.accounts.id ?? null;
}
