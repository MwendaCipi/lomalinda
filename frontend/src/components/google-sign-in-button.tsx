"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { GOOGLE_CLIENT_ID, GOOGLE_SIGN_IN_ENABLED, googleAccountsId, type GoogleCredentialResponse } from "@/lib/google-identity";

type GoogleSignInButtonProps = {
  /** Called with the signed ID token once the member picks a Google account. */
  onCredential: (response: GoogleCredentialResponse) => void;
  disabled?: boolean;
};

/**
 * Google's own "Continue with Google" button.
 *
 * Google draws the button into an iframe, which is the only styling it permits
 * for a sign-in entry point, so the component gives it the width and rounded
 * shape to sit with the rest of the form rather than trying to restyle it.
 *
 * Nothing is rendered without a client ID: a button that could only fail would
 * be worse than no button, and the password form already works.
 */
export function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const buttonSlot = useRef<HTMLDivElement>(null);
  // Google is handed one callback for the life of the page — registering a new
  // one on every render would stack a second iframe under the first — so the
  // callback is an effect event, which always sees the current handler and, in
  // turn, the `?next=` destination the member arrived with.
  const deliverCredential = useEffectEvent(onCredential);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accountsId = await googleAccountsId();
      if (cancelled || !accountsId || !buttonSlot.current || !wrapper.current) return;
      accountsId.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => deliverCredential(response),
      });
      // Measured, not fixed: the form column is narrower than Google's maximum
      // on a phone, and Google refuses a width below 200.
      const available = Math.floor(wrapper.current.clientWidth) || 320;
      const width = Math.max(200, Math.min(400, available));
      buttonSlot.current.replaceChildren();
      accountsId.renderButton(buttonSlot.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_SIGN_IN_ENABLED) return null;

  return (
    <div ref={wrapper} className="flex justify-center">
      <div ref={buttonSlot} className={disabled ? "pointer-events-none opacity-60" : undefined} />
    </div>
  );
}
