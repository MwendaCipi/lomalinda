/**
 * The buttons an announcement's card carries.
 *
 * The officer ticks what the post offers instead of choosing a "type" that
 * decides it for them: the ticks are the buttons, in the order below — the
 * ways to act first, then the ways to answer or attend. Codes match
 * `Announcement.CARD_OPTION_CHOICES` in the backend.
 *
 * Money and goods are two separate asks, not one button with a choice behind
 * it: Give now is money (M-Pesa, or a transfer the office records) and Give in
 * kind is goods handed over. The officer decides which of the two a post
 * carries — either, or both, or neither.
 */
export const CARD_OPTION_CHOICES = [
  { value: "give_now", label: "Give now" },
  { value: "pledge", label: "Pledge" },
  { value: "in_kind", label: "Give in kind" },
  { value: "comment", label: "Comment" },
  { value: "join_meeting", label: "Join meeting" },
  { value: "enroll", label: "Enroll now" },
  { value: "register", label: "Register now" },
] as const;

export type CardOption = (typeof CARD_OPTION_CHOICES)[number]["value"];

const OPTION_ORDER: string[] = CARD_OPTION_CHOICES.map((option) => option.value);

/** The codes that ask for money or goods, and so need an account named. */
export const GIVING_OPTION_CODES = ["give_now", "pledge", "in_kind"];

/** The giving asks, in the order they close the row: Give now is the last
 *  button a card carries, so money — or goods, or a pledge — always sits at
 *  the row's right-hand end whenever the post offers one. */
const GIVING_LAST = ["pledge", "in_kind", "give_now"];

/** A card's buttons, in the strip's own reading order, without duplicates,
 *  and with the giving asks kept at the right-hand end. */
export function cardButtons(options?: string[] | null): string[] {
  const chosen = (options ?? []).filter((code) => OPTION_ORDER.includes(code));
  const rank = (code: string) => {
    const giving = GIVING_LAST.indexOf(code);
    return giving === -1 ? OPTION_ORDER.indexOf(code) : OPTION_ORDER.length + giving;
  };
  return Array.from(new Set(chosen)).sort((a, b) => rank(a) - rank(b));
}
