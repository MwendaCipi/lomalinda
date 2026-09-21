/**
 * The church's password policy, mirroring backend/members/password_policy.py.
 * Four plain rules only: being similar to your name, or a common word, is fine.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_EXAMPLE = "Ngari@2026";
export const PASSWORD_REQUIREMENT_TEXT = `Use at least ${PASSWORD_MIN_LENGTH} characters, including a capital letter, a number and a symbol (for example ${PASSWORD_EXAMPLE}).`;

export type PasswordRule = { key: string; label: string; problem: string; met: boolean };

export function passwordRules(password: string): PasswordRule[] {
  const value = password ?? "";
  return [
    {
      key: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      problem: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      met: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      key: "capital",
      label: "A capital letter (A-Z)",
      problem: "Add at least one capital letter (A-Z).",
      met: /[A-Z]/.test(value),
    },
    {
      key: "number",
      label: "A number (0-9)",
      problem: "Add at least one number (0-9).",
      met: /[0-9]/.test(value),
    },
    {
      key: "symbol",
      label: "A symbol, such as @ # $ ! or %",
      problem: "Add at least one symbol, such as @ # $ ! or %.",
      met: /[^A-Za-z0-9]/.test(value),
    },
  ];
}

/** Messages for every unmet rule, matching the wording the API returns. */
export function passwordProblems(password: string): string[] {
  return passwordRules(password)
    .filter((rule) => !rule.met)
    .map((rule) => rule.problem);
}

export function passwordIsValid(password: string): boolean {
  return passwordProblems(password).length === 0;
}

export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone) return { valid: true };
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  const phoneRegex = /^\+?[0-9]{9,15}$/;
  if (!phoneRegex.test(cleaned)) {
    return { valid: false, error: "Please enter a valid phone number (e.g. 0712345678 or +254712345678)." };
  }
  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: true };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true };
}

export function validateNationalId(id: string): { valid: boolean; error?: string } {
  if (!id) return { valid: true };
  const idRegex = /^[0-9]{6,10}$/;
  if (!idRegex.test(id.trim())) {
    return { valid: false, error: "National ID must be between 6 and 10 digits." };
  }
  return { valid: true };
}

export function validateAmount(amount: number | string, min = 1): { valid: boolean; error?: string } {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num) || num < min) {
    return { valid: false, error: `Amount must be at least KES ${min}.` };
  }
  return { valid: true };
}

export function validateMinLength(text: string, minLength: number, fieldName = "Field"): { valid: boolean; error?: string } {
  if (!text || text.trim().length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters.` };
  }
  return { valid: true };
}
