/**
 * The buttons an announcement's card carries.
 *
 * The officer ticks what the post offers instead of choosing a "type" that
 * decides it for them: the ticks are the buttons, in the order below — the
 * ways to act first, then the ways to answer or attend. Codes match
 * `Announcement.CARD_OPTION_CHOICES` in the backend.
 */
export const CARD_OPTION_CHOICES = [
  { value: "give_now", label: "Give now" },
  { value: "pledge", label: "Pledge" },
  { value: "in_kind", label: "Support (in-kind)" },
  { value: "comment", label: "Comment" },
  { value: "join_meeting", label: "Join meeting" },
  { value: "enroll", label: "Enroll now" },
  { value: "register", label: "Register now" },
] as const;

export type CardOption = (typeof CARD_OPTION_CHOICES)[number]["value"];

const OPTION_ORDER: string[] = CARD_OPTION_CHOICES.map((option) => option.value);

/** The codes that ask for money or goods, and so need an account named. */
export const GIVING_OPTION_CODES = ["give_now", "pledge", "in_kind"];

/** A card's buttons, in the strip's own reading order, without duplicates. */
export function cardButtons(options?: string[] | null): string[] {
  const chosen = (options ?? []).filter((code) => OPTION_ORDER.includes(code));
  return Array.from(new Set(chosen)).sort(
    (a, b) => OPTION_ORDER.indexOf(a) - OPTION_ORDER.indexOf(b),
  );
}
