"use client";

import { ReactNode, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type LegalField = "privacy_policy" | "terms_of_use";

/**
 * One of the two legal documents, rendered from church settings.
 *
 * The site is a static export, so the page cannot read settings on the server;
 * this reads them in the browser instead. The built-in wording shows first (it
 * is what renders on the server and while the request is in flight), and a
 * document the church has written replaces it once it arrives. An empty field
 * or a failed request both keep the built-in wording — a legal page must never
 * turn into an error.
 *
 * A stored document is ordinary text the church typed into church settings:
 * blank lines separate paragraphs. Its section titles — a short line of its
 * own, with no closing punctuation — are set as headings, so the wording the
 * church adopted keeps the shape it had when the page carried it in code.
 */

/** A stored paragraph that reads as a section title rather than a sentence. */
function looksLikeHeading(paragraph: string): boolean {
  return !paragraph.includes("\n") && paragraph.length <= 60 && !/[.:;!?]$/.test(paragraph);
}
export function LegalDocument({ field, children }: { field: LegalField; children: ReactNode }) {
  const [churchText, setChurchText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive) return;
        const text = typeof data?.[field] === "string" ? data[field].trim() : "";
        setChurchText(text || null);
      })
      .catch(() => {
        if (alive) setChurchText(null);
      });
    return () => {
      alive = false;
    };
  }, [field]);

  if (churchText) {
    return (
      <div className="space-y-4 text-sm leading-7 text-[#617068]">
        {churchText.split(/\n{2,}/).map((paragraph, index) => {
          const text = paragraph.trim();
          if (looksLikeHeading(text)) {
            return (
              <h2 key={index} className="pt-2 text-xl font-semibold text-[#26352f]">
                {text}
              </h2>
            );
          }
          return (
            <p key={index} className="whitespace-pre-line">
              {text}
            </p>
          );
        })}
      </div>
    );
  }
  return <>{children}</>;
}
