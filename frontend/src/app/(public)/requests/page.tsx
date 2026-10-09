"use client";

import { useState } from "react";
import { HandHelping } from "lucide-react";

import { RequestsModal, type RequestType } from "@/components/requests-modal";

const REQUEST_TYPES = [
  { value: "prayer", label: "Prayer Request", description: "Send a prayer request to the pastoral team." },
  { value: "visitation", label: "Visitation Request", description: "Ask for a pastoral, home or hospital visit." },
  { value: "dedication", label: "Child Dedication", description: "Begin a conversation about dedicating your child during worship." },
  { value: "transfer", label: "Join / Transfer", description: "Request to join the church or transfer to another." },
] as const;

export default function RequestsPage() {
  const [open, setOpen] = useState(false);
  // Which desk the card opened: clicking Child Dedication must land on the
  // dedication form, not on the prayer one and a re-pick.
  const [picked, setPicked] = useState<RequestType>("prayer");

  return (
    <main className="min-h-screen bg-white text-bark">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ember/10">
            <HandHelping size={24} className="text-ember" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-bark sm:text-4xl">
            Make a Request
          </h1>
          <p className="mt-2 text-sm text-moss">
            Choose a request type to get started. The first field in the form is the request type.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {REQUEST_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                setPicked(type.value);
                setOpen(true);
              }}
              className="group rounded-2xl border border-sand-line bg-white p-6 text-left shadow-sm transition hover:border-ember/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-ember/10 px-3 py-1 font-semibold text-ember">
                  {type.label}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-moss">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      <RequestsModal open={open} initialType={picked} onClose={() => setOpen(false)} />
    </main>
  );
}
