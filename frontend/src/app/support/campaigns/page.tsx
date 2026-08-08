"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Campaign {
  id: number;
  name: string;
  title: string;
  description: string;
  target_amount: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  generate_card: boolean;
  custom_card_image?: string | null;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
}

export default function CampaignManagementPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfficial, setIsOfficial] = useState<boolean | null>(null);

  // New Campaign Form state
  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    name: "",
    title: "",
    description: "",
    target_amount: "",
    start_date: todayStr,
    end_date: "",
    generate_card: true,
    custom_card_image: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsOfficial(false);
      setLoading(false);
      return;
    }

    // Check user profile
    fetch(`${API_URL}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        const role = user?.role || "";
        const allowed = ["admin", "leader", "finance", "treasurer"].includes(role);
        setIsOfficial(allowed);
        if (allowed) fetchCampaigns(token);
        else setLoading(false);
      })
      .catch(() => {
        setIsOfficial(false);
        setLoading(false);
      });
  }, []);

  function fetchCampaigns(token: string) {
    fetch(`${API_URL}/api/members/campaigns/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCampaigns(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleCreateCampaign(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const numericTarget = parseFloat(form.target_amount);
    if (!form.name.trim() || isNaN(numericTarget) || numericTarget <= 0) {
      showAlert("Invalid input", "Please fill in a valid campaign name and a positive target amount greater than 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          title: form.title.trim() || form.name.trim(),
          description: form.description.trim(),
          target_amount: parseFloat(form.target_amount),
          start_date: form.start_date || todayStr,
          end_date: form.end_date || null,
          generate_card: form.generate_card,
          custom_card_image: form.custom_card_image.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to create campaign.");

      showAlert("Campaign Created", `Fundraising campaign "${data.name}" was created successfully.`, "success");
      setForm({
        name: "",
        title: "",
        description: "",
        target_amount: "",
        start_date: todayStr,
        end_date: "",
        generate_card: true,
        custom_card_image: "",
      });
      setShowCreateForm(false);
      fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error creating campaign";
      showAlert("Creation Failed", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleCampaignActive(id: number, currentActive: boolean) {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });

      if (!res.ok) throw new Error("Failed to update campaign status.");

      showAlert("Status Updated", `Campaign is now ${!currentActive ? "Active" : "Ended"}.`, "success");
      fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error updating campaign";
      showAlert("Update Error", msg, "error");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm font-medium text-[#617068]">Checking credentials...</p>
        </div>
      </main>
    );
  }

  if (isOfficial === false) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#dfdbd1]">
          <h1 className="text-2xl font-semibold">Official Access Required</h1>
          <p className="mt-2 text-sm text-[#617068]">
            Managing fundraising campaigns is restricted to authorized church officials and finance managers.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-full bg-[#5f8067] px-6 py-2.5 font-medium text-white">
            Sign In as Official
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-[#26352f] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/support" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] hover:underline">
              <span>&larr;</span>
              <span>Back to Stewardship</span>
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Fundraising Campaign Management</h1>
            <p className="mt-1 text-sm text-[#617068]">Create campaigns, generate shareable digital cards, and monitor progress.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center justify-center rounded-full bg-[#5f8067] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#4d6d55]"
          >
            {showCreateForm ? "Cancel" : "+ Create New Campaign"}
          </button>
        </div>

        {/* Create Campaign Modal / Form Section */}
        {showCreateForm && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
            <h2 className="text-xl font-bold text-[#26352f]">New Fundraising Campaign</h2>
            <p className="mt-1 text-xs text-[#617068]">
              The campaign name will automatically become the M-Pesa account reference name and will be listed under Giving Purposes.
            </p>

            <form onSubmit={handleCreateCampaign} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[#26352f]">
                  Campaign Account Name (M-Pesa Reference) *
                  <input
                    type="text"
                    required
                    placeholder="e.g. Building Fund 2026"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  Display Title
                  <input
                    type="text"
                    placeholder="e.g. Church Sanctuary Expansion 2026"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  Target Fundraising Goal (KES) *
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="e.g. 500000"
                    value={form.target_amount}
                    onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  Start Date *
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  End Date (Optional)
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  Custom Poster / Card Image URL (Optional)
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.custom_card_image}
                    onChange={(e) => setForm({ ...form, custom_card_image: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium sm:col-span-2">
                  Campaign Description / Story
                  <textarea
                    rows={3}
                    placeholder="Provide details about what this campaign aims to achieve..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 text-sm text-[#26352f]">
                    <input
                      type="checkbox"
                      checked={form.generate_card}
                      onChange={(e) => setForm({ ...form, generate_card: e.target.checked })}
                      className="h-4 w-4 rounded accent-[#5f8067]"
                    />
                    <span>Generate Digital Card &amp; Public Share Link</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#5f8067] px-6 font-medium text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                >
                  {isSubmitting ? "Creating..." : "Save & Launch Campaign"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Existing Campaigns List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-[#26352f]">All Campaigns ({campaigns.length})</h2>

          {campaigns.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-[#dfdbd1]">
              <p className="text-sm text-[#617068]">No fundraising campaigns created yet. Click "+ Create New Campaign" to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.map((c) => (
                <div key={c.id} className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.is_active ? "bg-[#e8f3ec] text-[#2d5d39]" : "bg-[#f3e8e8] text-[#8c2e2e]"}`}>
                        {c.is_active ? "Active" : "Ended"}
                      </span>
                      <span className="text-xs text-[#617068]">Started: {c.start_date}</span>
                    </div>

                    <h3 className="text-lg font-bold text-[#26352f]">{c.title || c.name}</h3>
                    <p className="text-xs text-[#617068]">M-Pesa Account Ref: <code className="font-mono font-bold text-[#b36b3c]">{c.name}</code></p>

                    {/* Progress details */}
                    <div>
                      <div className="flex justify-between text-xs font-medium text-[#26352f]">
                        <span>KES {Number(c.total_raised).toLocaleString()} raised</span>
                        <span>{c.percentage_raised}% of KES {Number(c.target_amount).toLocaleString()}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#e6e2d8]">
                        <div
                          className="h-full rounded-full bg-[#5f8067]"
                          style={{ width: `${Math.min(100, c.percentage_raised)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#dfdbd1] pt-4">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b36b3c] hover:underline"
                    >
                      <span>🎴 View Card &amp; Share</span>
                      <span>&rarr;</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleToggleCampaignActive(c.id, c.is_active)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${c.is_active ? "bg-[#f3e8e8] text-[#8c2e2e] hover:bg-[#ebdede]" : "bg-[#e8f3ec] text-[#2d5d39] hover:bg-[#dcece2]"}`}
                    >
                      {c.is_active ? "End Campaign" : "Reactivate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
