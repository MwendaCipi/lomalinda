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
