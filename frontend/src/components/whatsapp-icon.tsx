"use client";

/**
 * WhatsApp brand icon — inline SVG, not pulled from lucide-react.
 *
 * The official WhatsApp green is #25D366; the project's chat tint is a warmer
 * ember, so the icon wears `currentColor` and is coloured by the button that
 * owns it (text-ember on the contact modal, keeping it on the church's palette
 * rather than the app store's green).
 */
export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M17.41 10.59C16.51 11.49 15.31 12 14 12c-2.32 0-4.36-1.53-5.29-3.57-.38-.79-.28-1.77.26-2.45C9.75 7.5 10.84 7 12 7c1.42 0 2.64.67 3.52 1.71.33.39.65.77.94 1.16.15.22.12.5-.05.69l-.48.48c-.23.23-.33.56-.27.87.12.58.49 1.07.99 1.36l.42.24-1.34 1.34C16.5 15.57 14.67 17 12.5 17c-2.78 0-5.21-1.44-6.75-3.57-.35-.51-.49-1.15-.34-1.74.16-.6.62-1.04 1.19-1.17.56-.13 1.13.04 1.52.44 1.04 1.04 2.71 1.44 4.38 1.08 1.51-.34 2.72-1.25 3.38-2.53.67-1.3 1.03-2.72.97-4.16-.07-1.5-.65-2.86-1.61-3.89C16.3 3.2 15.1 2.5 13.7 2.2c-.82-.2-1.67-.17-2.47.14C9.08 2.85 6.5 4.7 5.5 7.25c-.61 1.56-.64 3.22-.1 4.79.55 1.56 1.68 2.88 3.16 3.71C7.4 15.07 8.93 16 10.6 16c1.06 0 2.07-.37 2.92-1.02.72-.53 1.26-1.25 1.58-2.07.32-.82.35-1.72.14-2.57-.21-.85-.73-1.59-1.41-2.08-.67-.49-1.46-.73-2.28-.7l-.02-.01z" />
    </svg>
  );
}
