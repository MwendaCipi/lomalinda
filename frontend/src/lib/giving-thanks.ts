// The public "thank you" a giver lands on once a gift has left their hands.
// Money may still be waiting on an M-Pesa PIN; in-kind is already recorded.
export type GiftKind = "money" | "in-kind";

export type ThanksOptions = {
  kind: GiftKind;
  /** How money was given — an M-Pesa prompt is pending, a bank transfer is filed. */
  method?: "mpesa" | "bank";
  /** The fund drive the gift belongs to, so the page can point back to it. */
  campaignId?: number | string | null;
  /** The fund drive's title, or the giving account for the general page. */
  title?: string | null;
};

/**
 * The link to the confirmation page, carrying just enough context — the kind
 * of gift, how it was given, and where it came from — for the page to address
 * the giver by name of drive and offer the way back.
 */
export function thankYouPath({ kind, method, campaignId, title }: ThanksOptions): string {
  const params = new URLSearchParams({ type: kind });
  if (method) params.set("method", method);
  const id = campaignId === null || campaignId === undefined ? "" : String(campaignId).trim();
  if (id) params.set("campaign", id);
  const clean = (title ?? "").trim();
  if (clean) params.set("title", clean);
  return `/give/thank-you?${params.toString()}`;
}
