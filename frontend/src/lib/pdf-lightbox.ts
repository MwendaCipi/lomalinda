/**
 * The church's viewer for the papers its desks produce — letters, statements,
 * rotas, reports and lists.
 *
 * The papers used to be fetched, handed to `window.open` as a blob, and shown
 * inside an overlay iframe. Both halves failed in the field: the popup was
 * asked for only after the fetch answered, so the browser refused it as not
 * the reader's doing, and a phone cannot render a PDF inside an iframe at
 * all — the frame comes up blank and the paper is never seen.
 *
 * The readers now work the way the Materials lessons do: the click opens a
 * fresh tab *synchronously* — while the browser still counts the reader's
 * activation — the request pages it behind a "document is loading" card, and
 * once the server answers the tab walks to the document's real URL. A real
 * URL with `inline` disposition is the one thing every browser, on every
 * phone, shows in its own PDF reader, with its own save control.
 *
 * The access token rides the URL rather than a header so the tab can make
 * that navigation itself. The backend honors `?access_token=` on safe
 * requests only, and only when no header was sent (see
 * backend/members/authentication.py); a header-carrying client is unaffected.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The small card the tab shows while the paper is being asked for. */
const LOADING_HTML =
  "<!doctype html><html><head><meta charset=\"utf-8\"><title>Opening the document\u2026</title>" +
  "<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;" +
  "font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:#665a4f;background:#faf6f0}" +
  "</style></head><body><p>Opening the document\u2026</p></body></html>";

export type PdfTabOptions = {
  /** Authentication for the preview fetch — the tab's own walk to the URL
   *  reads the token already on it, not these headers. */
  headers?: HeadersInit;
  /** The message shown when the server clears without details. */
  fallbackError?: string;
  /** Called with the reason when the paper cannot be shown. */
  onError?: (message: string) => void;
  /** Called once, on either path — callers use it to clear spinners. */
  onSettled?: () => void;
};

export function openPdfTab(url: string, options: PdfTabOptions = {}): void {
  const { headers, fallbackError = "The document could not be opened.", onError, onSettled } = options;
  // A browser navigation cannot carry an Authorization header. Give the
  // preview fetch one (even where a caller did not provide it) and put the
  // same short-lived token on the safe GET URL the new tab will navigate to.
  // `QueryAccessTokenAuthentication` accepts that parameter only for safe
  // methods, which keeps the actual document in the browser's PDF viewer
  // without making the report endpoint public.
  const requestHeaders = new Headers(headers);
  const storedToken = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  if (!requestHeaders.has("Authorization") && storedToken) {
    requestHeaders.set("Authorization", `Bearer ${storedToken}`);
  }
  const bearer = requestHeaders.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? storedToken;
  const authenticatedUrl = new URL(url, window.location.origin);
  if (bearer) authenticatedUrl.searchParams.set("access_token", bearer);

  // The one synchronous step a click gets: the tab itself, before any
  // awaiting — opened later, the browser would refuse it.
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    onError?.("Allow pop-ups for this site to open the document.");
    onSettled?.();
    return;
  }
  tab.document.open();
  tab.document.write(LOADING_HTML);
  tab.document.close();

  fetch(authenticatedUrl.toString(), { headers: requestHeaders })
    .then(async (res) => {
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.json())?.detail ?? "";
        } catch {
          // A non-JSON error body carries nothing readable.
        }
        throw new Error(detail || fallbackError);
      }
    })
    .then(() => {
      tab.location.href = authenticatedUrl.toString();
    })
    .catch((error) => {
      // Nothing was shown; close the tab so the error is read where it was asked for.
      tab.close();
      onError?.(error instanceof Error ? error.message : fallbackError);
    })
    .finally(() => onSettled?.());
}
