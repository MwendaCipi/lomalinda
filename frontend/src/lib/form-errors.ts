export type FieldErrors = Record<string, string>;

/** Backend field names that map onto the local input names. */
const FIELD_ALIASES: Record<string, string> = {
  confirm_password: "confirmPassword",
  confirmPassword: "confirmPassword",
  password2: "confirmPassword",
  phone_number: "phoneNumber",
  phoneNumber: "phoneNumber",
};

function flatten(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flatten).filter(Boolean).join(" ");
  }
  return String(value).trim();
}

/**
 * Split a DRF error body into messages that belong next to an input and
 * messages that belong in the form's general error banner.
 *
 * `fields` lists the input names the form can attach an error to, e.g.
 * `["username", "password", "confirmPassword"]`. Anything else — `detail`,
 * `non_field_errors`, an unknown key — becomes a general message so it is
 * never silently swallowed.
 */
export function parseApiErrors(
  data: unknown,
  fields: string[] = []
): { fieldErrors: FieldErrors; generalError: string } {
  const fieldErrors: FieldErrors = {};
  const general: string[] = [];

  const entries: [string, unknown][] =
    data && typeof data === "object" && !Array.isArray(data)
      ? Object.entries(data as Record<string, unknown>)
      : [["detail", data]];

  for (const [rawKey, rawValue] of entries) {
    const text = flatten(rawValue);
    if (!text) continue;
    const key = FIELD_ALIASES[rawKey] ?? rawKey;
    if (fields.includes(key)) {
      fieldErrors[key] = fieldErrors[key] ? `${fieldErrors[key]} ${text}` : text;
    } else {
      general.push(text);
    }
  }

  return { fieldErrors, generalError: general.join(" ") };
}
