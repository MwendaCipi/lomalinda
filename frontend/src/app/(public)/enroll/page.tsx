"use client";

import { useEffect, useState } from "react";
import { PublicSectionNav } from "@/components/public-section-nav";
import { Church, Handshake, Mail, Phone } from "lucide-react";
import { requestsAndCareLinks } from "@/config/site-sections";
import { EnrollmentForm } from "@/components/enrollment-form";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TransferRecord = {
  id: number;
  name: string;
  phone_number?: string;
  email?: string;
  transfer_type?: string;
  other_church?: string;
  joining_mode?: string;
  reason?: string;
  created_at?: string;
  status?: string;
};

export default function EnrollPage() {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);

  const fetchTransfers = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/transfers/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTransfers(Array.isArray(data) ? data : []);
      } else {
        setTransfers([]);
      }
    } catch {
      setTransfers([]);
    } finally {
      setFetchingList(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12">
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Requests &amp; Care</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Membership</h1>
                <p className="mt-2 max-w-2xl text-base leading-8 text-moss">
                  Manage membership transfer requests to join SDA Loma Linda or move to another SDA church.
                </p>
              </div>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ember-dark"
                >
                  + Add Membership / Transfer Request
                </button>
              )}
            </div>

            {showForm ? (
              <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:p-7">
                <div className="flex items-center justify-between border-b border-sand-line pb-4 mb-6">
                  <h2 className="text-xl font-semibold text-bark">New Request Form</h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-sm font-semibold text-ember hover:underline"
                  >
                    &larr; Back to Requests
                  </button>
                </div>

                <EnrollmentForm
                  allowTransferOut
                  onSubmitted={() => {
                    setShowForm(false);
                    fetchTransfers();
                  }}
                />
              </section>
            ) : (
              <section className="mt-6">
                {fetchingList ? (
                  <div className="rounded-3xl border border-sand-line bg-white p-8 text-center text-sm text-moss">
                    Loading membership &amp; transfer requests...
                  </div>
                ) : transfers.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-8 sm:p-12 text-center">
                    <Handshake size={36} className="text-moss-faint" aria-hidden="true" />
                    <h3 className="mt-3 text-lg font-semibold text-bark">
                      No membership or transfer requests submitted yet
                    </h3>
                    <p className="mt-1 text-sm text-moss">
                      Submit a request to join SDA Loma Linda through baptism or transfer, or request a transfer out.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="mt-5 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember-dark"
                    >
                      + Add Membership / Transfer Request
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {transfers.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col justify-between rounded-2xl border border-sand-line bg-white p-5 shadow-sm space-y-3"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-moss">
                            <span className="font-semibold text-bark">{item.name}</span>
                            <span className="capitalize rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold text-ember">
                              {item.transfer_type || "Transfer Request"}
                            </span>
                          </div>
                          {item.phone_number && (
                            <p className="mt-2 text-xs text-moss">
                              <Phone size={11} className="inline" aria-hidden="true" /> {item.phone_number} {item.email ? <> • <Mail size={11} className="inline" aria-hidden="true" /> {item.email}</> : ""}
                            </p>
                          )}
                          {item.other_church && (
                            <p className="mt-1 text-xs text-moss">
                              <Church size={11} className="inline" aria-hidden="true" /> Church: <strong>{item.other_church}</strong>
                            </p>
                          )}
                          {item.reason && (
                            <p className="mt-2 text-xs leading-relaxed text-bark italic">
                              &ldquo;{item.reason}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-moss pt-2 border-t border-sand-line">
                          <span>
                            Status: <strong className="capitalize text-sage">{item.status || "Pending Board Review"}</strong>
                          </span>
                          {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
        </div>
      </div>

      {/* The old Requests sidebar, now part of the page. */}
      <PublicSectionNav
        eyebrow="Get started"
        title="Other ways to reach the church"
        description="Prayer, visitation and child dedication all start with a short form."
        links={requestsAndCareLinks}
        activeKey="enroll"
        className="border-t border-sand-line bg-white/60"
      />
    </main>
  );
}
