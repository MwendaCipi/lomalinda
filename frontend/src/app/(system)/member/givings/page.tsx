"use client";

import { useState } from "react";
import { MyGivings } from "@/components/my-givings";
import { MyInKindGivings } from "@/components/my-in-kind-givings";
import { MemberWorkspace } from "@/components/member-workspace";

/**
 * My Givings — the member's giving records, on their own route.
 *
 * Both lists moved here from the pages that used to *be* the record and push
 * the act of giving behind a modal: money from /give, in-kind from
 * /support/in-kind. The account menu links this route (`myGivings` in the
 * navigation registry, which also names the page above), and the toggle picks
 * which of the two records is on show — one eye switch, one browser, covering
 * both.
 */
export default function MyGivingsPage() {
  const [kind, setKind] = useState<"money" | "in-kind">("money");

  return (
    <MemberWorkspace>
      <div role="group" aria-label="Which giving record" className="flex flex-wrap items-center gap-1.5">
        {([["money", "Money"], ["in-kind", "In-Kind"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            aria-pressed={kind === key}
            className={`h-8 rounded-xl px-3.5 text-xs font-semibold transition ${
              kind === key
                ? "bg-bark text-white shadow-sm"
                : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "money" ? <MyGivings /> : <MyInKindGivings />}
    </MemberWorkspace>
  );
}
