"use client";

import { useEffect, useState } from "react";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";
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
    <main className="min-h-screen bg-white text-[#26352f]">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 w-full min-h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1]">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Membership &amp; Transfers</h1>
                <p className="mt-1 text-sm text-[#617068]">
                  Manage membership transfer requests to join SDA Loma Linda or move to another SDA church.
                </p>
              </div>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#96552e]"
                >
                  + Add Membership / Transfer Request
                </button>
              )}
            </div>

            {showForm ? (
              <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4 mb-6">
                  <h2 className="text-xl font-semibold text-[#26352f]">New Request Form</h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-sm font-semibold text-[#b36b3c] hover:underline"
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
                  <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                    Loading membership &amp; transfer requests...
                  </div>
                ) : transfers.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                    <span className="text-4xl" aria-hidden="true">
                      🤝
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                      No membership or transfer requests submitted yet
                    </h3>
                    <p className="mt-1 text-sm text-[#617068]">
                      Submit a request to join SDA Loma Linda through baptism or transfer, or request a transfer out.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="mt-5 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]"
                    >
                      + Add Membership / Transfer Request
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {transfers.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-[#617068]">
                            <span className="font-semibold text-[#26352f]">{item.name}</span>
                            <span className="capitalize rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[11px] font-semibold text-[#b36b3c]">
                              {item.transfer_type || "Transfer Request"}
                            </span>
                          </div>
                          {item.phone_number && (
                            <p className="mt-2 text-xs text-[#617068]">
                              📞 {item.phone_number} {item.email ? `• ✉️ ${item.email}` : ""}
                            </p>
                          )}
                          {item.other_church && (
                            <p className="mt-1 text-xs text-[#617068]">
                              ⛪ Church: <strong>{item.other_church}</strong>
                            </p>
                          )}
                          {item.reason && (
                            <p className="mt-2 text-xs leading-relaxed text-[#26352f] italic">
                              &ldquo;{item.reason}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
                          <span>
                            Status: <strong className="capitalize text-[#5f8067]">{item.status || "Pending Board Review"}</strong>
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
      </div>
    </main>
  );
}
