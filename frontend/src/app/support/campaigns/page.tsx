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
  target_groups?: string[];
  custom_card_image?: string | null;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
  assigned_cards_count?: number;
  group_breakdown?: Record<string, number>;
}

const AVAILABLE_GROUPS = [
  { key: "choir", label: "Choir Ministry" },
  { key: "youth", label: "Youth Ministries" },
  { key: "children", label: "Children Ministry" },
  { key: "men", label: "Adventist Men Ministries" },
  { key: "women", label: "Adventist Women Ministries" },
  { key: "leaders", label: "Church Leaders & Elders" },
  { key: "all_members", label: "All Members (Entire Congregation)" },
];

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
    target_groups: ["all_members"] as string[],
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

  function handleGroupToggle(groupKey: string) {
    setForm((current) => {
      const exists = current.target_groups.includes(groupKey);
      let updated: string[];
      if (groupKey === "all_members") {
        updated = exists ? [] : ["all_members"];
      } else {
        const filtered = current.target_groups.filter((g) => g !== "all_members");
        updated = exists ? filtered.filter((g) => g !== groupKey) : [...filtered, groupKey];
      }
      return { ...current, target_groups: updated };
    });
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
          target_amount: numericTarget,
          start_date: form.start_date || todayStr,
          end_date: form.end_date || null,
          generate_card: form.generate_card,
          target_groups: form.target_groups.length > 0 ? form.target_groups : ["all_members"],
          custom_card_image: form.custom_card_image.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to create campaign.");

      showAlert(
        "Campaign & Cards Created",
        `Fundraising campaign "${data.name}" was created successfully, and personalized card notifications were dispatched to assigned groups.`,
        "success"
      );
      setForm({
        name: "",
        title: "",
        description: "",
        target_amount: "",
        start_date: todayStr,
        end_date: "",
        generate_card: true,
        target_groups: ["all_members"],
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
            <Link href="/administration" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] hover:underline">
              <span>&larr;</span>
              <span>Back to Leader Portal</span>
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Fundraising Campaign Management</h1>
            <p className="mt-1 text-sm text-[#617068]">
              Create campaigns, assign personalized cards to church groups &amp; members, and monitor group progress.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center justify-center rounded-full bg-[#5f8067] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#4d6d55]"
          >
            {showCreateForm ? "Cancel" : "+ Create New Campaign"}
          </button>
        </div>

        {/* Create Campaign Form Section */}
        {showCreateForm && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
            <h2 className="text-xl font-bold text-[#26352f]">New Fundraising Campaign</h2>
            <p className="mt-1 text-xs text-[#617068]">
              Select which groups/ministries will receive personal cards. Each member in the group gets a personalized card link &amp; notification.
            </p>

            <form onSubmit={handleCreateCampaign} className="mt-6 space-y-5">
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
              </div>

              {/* Group / Department Selection Checkboxes */}
              <div className="rounded-2xl bg-[#faf9f5] p-5 ring-1 ring-[#dfdbd1]">
                <label className="block text-sm font-bold text-[#26352f]">Assign Personal Cards to Groups / Ministries</label>
                <p className="mt-0.5 text-xs text-[#617068]">Members in selected groups will receive personal fundraising card links and notifications.</p>

                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {AVAILABLE_GROUPS.map((g) => {
                    const isChecked = form.target_groups.includes(g.key);
                    return (
                      <label key={g.key} className="flex items-center gap-2.5 rounded-xl bg-white p-3 text-xs font-medium text-[#26352f] ring-1 ring-[#dfdbd1] cursor-pointer hover:bg-[#f7f4ee]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleGroupToggle(g.key)}
                          className="h-4 w-4 rounded accent-[#5f8067]"
                        />
                        <span>{g.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="block text-sm font-medium">
                Campaign Description / Story
                <textarea
                  rows={3}
                  placeholder="Provide details about what this campaign aims to achieve..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </label>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#5f8067] px-6 font-medium text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                >
                  {isSubmitting ? "Generating Cards & Notifications..." : "Save & Issue Personalized Cards"}
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
                      <span className="text-xs text-[#617068]">Cards Issued: <strong className="text-[#26352f]">{c.assigned_cards_count || 0}</strong></span>
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

                    {/* Group Breakdown mini badge summary */}
                    {c.group_breakdown && Object.keys(c.group_breakdown).length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-semibold text-[#617068]">Group Raised Breakdown:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {Object.entries(c.group_breakdown).map(([grp, amt]) => (
                            <span key={grp} className="rounded-lg bg-[#f7f4ee] px-2 py-1 text-[10px] font-semibold text-[#26352f] ring-1 ring-[#dfdbd1]">
                              {grp}: KES {Number(amt).toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#dfdbd1] pt-4">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b36b3c] hover:underline"
                    >
                      <span>🎴 View Main Card &amp; Leaderboard</span>
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
