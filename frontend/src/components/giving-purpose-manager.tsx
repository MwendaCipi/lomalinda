"use client";

import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function GivingPurposeManager() {
  const [purposes, setPurposes] = useState<{ id: number; name: string }[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  async function loadPurposes() {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_URL}/api/members/giving-purposes/`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) setPurposes(await response.json());
  }

  useEffect(() => {
    loadPurposes().catch(() => setMessage("Unable to load giving purposes."));
  }, []);

  async function addPurpose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_URL}/api/members/giving-purposes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim() })
    });
    if (response.ok) {
      setName("");
      const successMsg = "Giving purpose added.";
      setMessage(successMsg);
      showAlert("Purpose Added", successMsg, "success");
      await loadPurposes();
    } else {
      const errorMsg = "Unable to add giving purpose.";
      setMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    }
  }

  async function removePurpose(id: number) {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_URL}/api/members/giving-purposes/${id}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      setPurposes((current) => current.filter((purpose) => purpose.id !== id));
      const successMsg = "Giving purpose removed.";
      setMessage(successMsg);
      showAlert("Purpose Removed", successMsg, "success");
    } else {
      const errorMsg = "Unable to remove giving purpose.";
      setMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    }
  }

  return <section className="rounded-2xl border border-[#dfdbd1] bg-white p-7"><h2 className="text-2xl font-semibold">Giving purposes</h2><p className="mt-2 text-sm text-[#617068]">Add or remove purposes shown on the giving form.</p><form onSubmit={addPurpose} className="mt-5 flex flex-col gap-3 sm:flex-row"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="New giving purpose" className="min-w-0 flex-1 rounded-xl border border-[#c9c5bb] px-4 py-3" /><button className="rounded-xl bg-[#b36b3c] px-5 py-3 font-semibold text-white hover:bg-[#96552e]">Add purpose</button></form><div className="mt-5 flex flex-wrap gap-2">{purposes.map((purpose) => <span key={purpose.id} className="inline-flex items-center gap-2 rounded-full bg-[#eef2ed] px-3 py-2 text-sm text-[#3d5148]">{purpose.name}<button type="button" onClick={() => removePurpose(purpose.id)} aria-label={`Remove ${purpose.name}`} className="font-bold text-[#b36b3c] hover:text-[#96552e]">&times;</button></span>)}</div>{message && <p className="mt-4 text-sm text-[#617068]">{message}</p>}</section>;
}
