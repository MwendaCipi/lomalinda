"use client";

import { PASSWORD_REQUIREMENT_TEXT, passwordRules } from "@/lib/validation";

/**
 * Live password checklist. Shown beside every "choose a password" field so the
 * rules are visible before submitting rather than only as an error afterwards.
 */
export function PasswordRules({ password, className = "" }: { password: string; className?: string }) {
  const rules = passwordRules(password);

  return (
    <div className={`rounded-xl bg-[#f7f4ee] p-3 ${className}`}>
      <p className="text-xs text-[#617068]">{PASSWORD_REQUIREMENT_TEXT}</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={`flex items-center gap-1.5 text-xs font-medium ${
              rule.met ? "text-[#3d6b4f]" : "text-[#8a8378]"
            }`}
          >
            <span aria-hidden="true">{rule.met ? "✓" : "•"}</span>
            <span>{rule.label}</span>
            <span className="sr-only">{rule.met ? " — met" : " — not yet met"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
