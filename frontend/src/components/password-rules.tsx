"use client";

import { PASSWORD_REQUIREMENT_TEXT, passwordRules } from "@/lib/validation";
import { Check } from "lucide-react";

/**
 * Live password checklist. Shown beside every "choose a password" field so the
 * rules are visible before submitting rather than only as an error afterwards.
 */
export function PasswordRules({ password, className = "" }: { password: string; className?: string }) {
  const rules = passwordRules(password);

  return (
    <div className={`rounded-xl bg-sand p-3 ${className}`}>
      <p className="text-xs text-moss">{PASSWORD_REQUIREMENT_TEXT}</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={`flex items-center gap-1.5 text-xs font-medium ${
              rule.met ? "text-sage-rich" : "text-warmgray"
            }`}
          >
            <span aria-hidden="true" className="flex w-3 justify-center">{rule.met ? <Check size={12} /> : "•"}</span>
            <span>{rule.label}</span>
            <span className="sr-only">{rule.met ? " — met" : " — not yet met"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
