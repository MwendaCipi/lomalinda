"use client";

import { FormEvent, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { showAlert } from "@/lib/alerts";
import { ROLE_OPTIONS } from "./roles-combobox";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// The right the settings screen shows for each role, straight from the API —
// the label/description text is the backend's, so the two never drift.
type RoleRight = { code: string; label: string; description: string };
type RoleRightsPayload = { rights: RoleRight[]; by_role: Record<string, string[]> };

export function ChurchSettingsManager() {
  const [churchName, setChurchName] = useState("SDA Loma Linda, Meru");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [midweekVespersLink, setMidweekVespersLink] = useState("");
  const [liveServiceLink, setLiveServiceLink] = useState("");
  const [liveServiceActive, setLiveServiceActive] = useState(false);
  const [midweekVespersTime, setMidweekVespersTime] = useState("Wednesday · 8:00 PM – 9:00 PM");
  const [fridayVespersTime, setFridayVespersTime] = useState("Friday · 5:30 PM – 6:30 PM");
  const [sabbathTime, setSabbathTime] = useState("Saturday · 8:00 AM – 4:00 PM");
  const [clarionCallHeading, setClarionCallHeading] = useState("A place to belong.\nA faith to share.\nA hope that transforms lives.");
  const [clarionCallSubtext, setClarionCallSubtext] = useState("Join SDA Loma Linda as we study God's Word, support one another, and reach out to our community with faith and compassion.");
  const [defaultReceiptMessage, setDefaultReceiptMessage] = useState("Dear {name},\n\nYour contribution of {amount} towards {account} has been received. Thank you, and may God bless you abundantly");
  const [defaultBusinessMeetingInvitationMessage, setDefaultBusinessMeetingInvitationMessage] = useState(
    "{greeting}, {name}. {church} is inviting you to a church business meeting scheduled for {day}, {date} at {meeting_time}, {location}. God bless you as you purpose to attend."
  );
  const [defaultBoardMeetingInvitationMessage, setDefaultBoardMeetingInvitationMessage] = useState(
    "{greeting}, {name}. {church} is inviting you to a board meeting scheduled for {day}, {date} from {start_time} to {end_time}. God bless you as you purpose to attend."
  );
  // Filled by the API so the tokens listed here are exactly the ones the
  // backend substitutes — help text cannot drift from behaviour.
  const [invitationPlaceholders, setInvitationPlaceholders] = useState<{ token: string; description: string }[]>([]);
  // The line the dashboard greeting ends with. Short by design; the API caps it
  // at the same length this input does.
  const [encouragementLine, setEncouragementLine] = useState("Jesus is coming again.");
  const ENCOURAGEMENT_MAX = 140;
  // Per-role rights as configured on the Church Roles Configuration box.
  const [roleRights, setRoleRights] = useState<RoleRightsPayload>({ rights: [], by_role: {} });
  // Which role's rights the settings screen is currently showing.
  const [rightsRole, setRightsRole] = useState<string>("clerk");
  const [bankName, setBankName] = useState("KCB Bank Kenya");
  const [bankAccountName, setBankAccountName] = useState("SDA Church Main Account");
  const [bankAccountNumber, setBankAccountNumber] = useState("1122334455");
  const [bankBranch, setBankBranch] = useState("Meru");
  const [bankSwiftCode, setBankSwiftCode] = useState("KCBKNEN");
  const [bankPaybillNumber, setBankPaybillNumber] = useState("522522");
  const [mpesaPaybillNumber, setMpesaPaybillNumber] = useState("");
  const [mpesaAccountNumber, setMpesaAccountNumber] = useState("");
  const [mpesaAccountName, setMpesaAccountName] = useState("");
  const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState("");
  const [invitationLinkLifetimeDays, setInvitationLinkLifetimeDays] = useState(7);
  // The church's own legal documents; empty means the built-in wording on the
  // public pages, so a church that never touches these loses nothing.
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [termsOfUse, setTermsOfUse] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setChurchName(data.church_name || "SDA Loma Linda, Meru");
          setAddress(data.address || "");
          if (data.latitude) setLatitude(Number(data.latitude));
          if (data.longitude) setLongitude(Number(data.longitude));
          setMidweekVespersLink(data.midweek_vespers_link || "");
          setLiveServiceLink(data.live_service_link || "");
          setLiveServiceActive(Boolean(data.live_service_active));
          setMidweekVespersTime(data.midweek_vespers_time || "Wednesday · 8:00 PM – 9:00 PM");
          setFridayVespersTime(data.friday_vespers_time || "Friday · 5:30 PM – 6:30 PM");
          setSabbathTime(data.sabbath_time || "Saturday · 8:00 AM – 4:00 PM");
          if (data.clarion_call_heading) setClarionCallHeading(data.clarion_call_heading);
          if (data.clarion_call_subtext) setClarionCallSubtext(data.clarion_call_subtext);
          if (data.default_receipt_message) setDefaultReceiptMessage(data.default_receipt_message);
          if (Array.isArray(data.invitation_placeholders)) {
            setInvitationPlaceholders(data.invitation_placeholders);
          }
          if (typeof data.dashboard_encouragement_line === "string") {
            setEncouragementLine(data.dashboard_encouragement_line);
          }
          if (data.default_business_meeting_invitation_message) {
            setDefaultBusinessMeetingInvitationMessage(data.default_business_meeting_invitation_message);
          }
          if (data.default_board_meeting_invitation_message) {
            setDefaultBoardMeetingInvitationMessage(data.default_board_meeting_invitation_message);
          }
          if (data.role_rights && Array.isArray(data.role_rights.rights)) {
            setRoleRights(data.role_rights);
          }
          if (data.bank_name) setBankName(data.bank_name);
          if (data.bank_account_name) setBankAccountName(data.bank_account_name);
          if (data.bank_account_number) setBankAccountNumber(data.bank_account_number);
          if (data.bank_branch) setBankBranch(data.bank_branch);
          if (data.bank_swift_code) setBankSwiftCode(data.bank_swift_code);
          if (data.bank_paybill_number) setBankPaybillNumber(data.bank_paybill_number);
          if (data.mpesa_paybill_number) setMpesaPaybillNumber(data.mpesa_paybill_number);
          if (data.mpesa_account_number) setMpesaAccountNumber(data.mpesa_account_number);
          if (data.mpesa_account_name) setMpesaAccountName(data.mpesa_account_name);
          if (data.mpesa_phone_number) setMpesaPhoneNumber(data.mpesa_phone_number);
          if (data.invitation_link_lifetime_days) setInvitationLinkLifetimeDays(data.invitation_link_lifetime_days);
          if (typeof data.privacy_policy === "string") setPrivacyPolicy(data.privacy_policy);
          if (typeof data.terms_of_use === "string") setTermsOfUse(data.terms_of_use);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleRoleRight = (role: string, right: string) => {
    setRoleRights((prev) => {
      const current = prev.by_role[role] ?? [];
      const next = current.includes(right)
        ? current.filter((r) => r !== right)
        : [...current, right];
      return { ...prev, by_role: { ...prev.by_role, [role]: next } };
    });
  };

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const token = localStorage.getItem("access_token");
      const payload = {
        church_name: churchName,
        address,
        latitude,
        longitude,
        midweek_vespers_link: midweekVespersLink,
        live_service_link: liveServiceLink,
        live_service_active: liveServiceActive,
        midweek_vespers_time: midweekVespersTime,
        friday_vespers_time: fridayVespersTime,
        sabbath_time: sabbathTime,
        clarion_call_heading: clarionCallHeading,
        clarion_call_subtext: clarionCallSubtext,
        default_receipt_message: defaultReceiptMessage,
        default_business_meeting_invitation_message: defaultBusinessMeetingInvitationMessage,
        default_board_meeting_invitation_message: defaultBoardMeetingInvitationMessage,
        dashboard_encouragement_line: encouragementLine.trim(),
        role_rights: roleRights.by_role,
        bank_name: bankName,
        bank_account_name: bankAccountName,
        bank_account_number: bankAccountNumber,
        bank_branch: bankBranch,
        bank_swift_code: bankSwiftCode,
        bank_paybill_number: bankPaybillNumber,
        mpesa_paybill_number: mpesaPaybillNumber,
        mpesa_account_number: mpesaAccountNumber,
        mpesa_account_name: mpesaAccountName,
        mpesa_phone_number: mpesaPhoneNumber,
        invitation_link_lifetime_days: invitationLinkLifetimeDays,
        privacy_policy: privacyPolicy,
        terms_of_use: termsOfUse,
      };

      const res = await fetch(`${API_URL}/api/members/church-settings/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to save church settings.");
      }

      showAlert("Settings Saved", "Church settings and clarion call updated successfully.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      showAlert("Error", msg, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-[#617068]">Loading church settings...</div>;
  }

  return (
    <section className="w-full min-h-[calc(100vh-4rem)] bg-white p-6 sm:p-8 lg:p-10 border-b border-[#dfdbd1]">
      <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#26352f]">Church Settings & Configuration</h2>
          <p className="mt-1 text-xs text-[#617068]">
            Configure custom homepage clarion call message, service links, and church details.
          </p>
        </div>
        <span className="rounded-full bg-[#26352f] px-3 py-1 text-xs font-semibold text-white">
          Admin Portal
        </span>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        {/* Clarion Call Settings Box */}
        <div className="rounded-2xl border border-[#b36b3c]/30 bg-[#faf7f2] p-5">
          <h3 className="text-base font-bold text-[#b36b3c] flex items-center gap-2">
            <span>📢</span> Homepage Clarion Call (Default Message)
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Displayed in the main hero section when there are no active announcements for the week.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">
                Clarion Call Heading (Separate lines with ENTER)
              </label>
              <textarea
                rows={3}
                required
                value={clarionCallHeading}
                onChange={(e) => setClarionCallHeading(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#b36b3c]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#26352f]">
                Clarion Call Subtext / Description
              </label>
              <textarea
                rows={2}
                required
                value={clarionCallSubtext}
                onChange={(e) => setClarionCallSubtext(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
              />
            </div>
          </div>
        </div>

        {/* Default Receipt Message Settings Box */}
        <div className="rounded-2xl border border-[#5f8067]/30 bg-[#f4f7f4] p-5">
          <h3 className="text-base font-bold text-[#5f8067] flex items-center gap-2">
            <span>🧾</span> Default Contribution Receipt Message
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Default thank-you message included when sending SMS and email contribution receipts to givers.
          </p>

          <div className="mt-3">
            <label className="mt-4 block text-xs font-semibold text-[#26352f]">
              Receipt Thank-You Message
            </label>
            <p className="mt-0.5 text-xs text-[#617068]">
              Supports placeholders: <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{name}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{amount}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{account}"}</code>. The message is sent exactly as written — start it with your greeting (e.g. <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">Dear {"{name}"}</code>).
            </p>
            <textarea
              rows={3}
              value={defaultReceiptMessage}
              onChange={(e) => setDefaultReceiptMessage(e.target.value)}
              placeholder="Dear {name}, your contribution of {amount} towards {account} has been received. Thank you, and may God bless you abundantly"
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#5f8067]"
            />
          </div>
        </div>

        {/* Church Bank Account Details Box */}
        <div className="rounded-2xl border border-[#26352f]/30 bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>🏦</span> Church Bank Account &amp; Payment Details
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Configure the default bank account details displayed to members giving via Bank Transfer or Paybill.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. KCB Bank Kenya"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
              <input
                type="text"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="e.g. SDA Church Main Account"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Account Number</label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="e.g. 1122334455"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Branch Name</label>
              <input
                type="text"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
                placeholder="e.g. Meru"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">SWIFT / Routing Code</label>
              <input
                type="text"
                value={bankSwiftCode}
                onChange={(e) => setBankSwiftCode(e.target.value)}
                placeholder="e.g. KCBKNEN"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">M-Pesa Paybill Number</label>
              <input
                type="text"
                value={bankPaybillNumber}
                onChange={(e) => setBankPaybillNumber(e.target.value)}
                placeholder="e.g. 522522"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
          </div>
        </div>

        {/* Church M-Pesa Payment Details Box */}
        <div className="rounded-2xl border border-[#3d7146]/30 bg-[#f4f7f2] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>📱</span> Church M-Pesa Payment Details
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Pay Bill or Send Money details shown to members giving from their phone. Leave a field blank to hide it from the giving page.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Pay Bill Number</label>
              <input
                type="text"
                value={mpesaPaybillNumber}
                onChange={(e) => setMpesaPaybillNumber(e.target.value)}
                placeholder="e.g. 522522"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#3d7146]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Account Number</label>
              <input
                type="text"
                value={mpesaAccountNumber}
                onChange={(e) => setMpesaAccountNumber(e.target.value)}
                placeholder="e.g. TITHE — what givers type in the prompt"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#3d7146]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
              <input
                type="text"
                value={mpesaAccountName}
                onChange={(e) => setMpesaAccountName(e.target.value)}
                placeholder="e.g. SDA Loma Linda Church"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#3d7146]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Send Money Number</label>
              <input
                type="tel"
                value={mpesaPhoneNumber}
                onChange={(e) => setMpesaPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="e.g. 0712345678 (optional)"
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#3d7146]"
              />
            </div>
          </div>
        </div>

        {/* Church Roles Configuration Box */}
        <div className="rounded-2xl border border-[#b36b3c]/30 bg-[#faf7f2] p-5">
          <h3 className="text-base font-bold text-[#b36b3c] flex items-center gap-2">
            <span>🛡️</span> Church Roles Configuration
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Every role holder sits on the church board by default, so board invitations go to them automatically —
            except assistants, who share the role's work but not its board seat. Pick a role below to give or take away
            what its holders may do in the app.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => setRightsRole(role.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  rightsRole === role.value
                    ? "border-[#b36b3c] bg-white text-[#26352f] shadow-sm"
                    : "border-[#dfdbd1] bg-[#f7f4ee]/60 text-[#617068] hover:border-[#b36b3c]/50"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>

          {(() => {
            const selected = ROLE_OPTIONS.find((r) => r.value === rightsRole) ?? ROLE_OPTIONS[0];
            const held = new Set(roleRights.by_role[selected.value] ?? []);
            return (
              <div className="mt-4 rounded-xl border border-[#dfdbd1] bg-white p-4">
                <p className="text-sm font-bold text-[#26352f]">
                  {selected.label}
                  <span className="ml-2 text-xs font-medium text-[#617068]">— rights held by this role</span>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roleRights.rights.map((right) => {
                    const isHeld = held.has(right.code);
                    return (
                      <label
                        key={right.code}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${
                          isHeld
                            ? "border-[#b36b3c] bg-[#faf7f2] text-[#26352f] shadow-sm"
                            : "border-[#dfdbd1] bg-[#f7f4ee]/60 text-[#617068] hover:border-[#b36b3c]/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isHeld}
                          onChange={() => toggleRoleRight(selected.value, right.code)}
                          className="mt-0.5 h-4 w-4 rounded border-[#c9c5bb] text-[#b36b3c] focus:ring-[#b36b3c]"
                        />
                        <span className="min-w-0">
                          <span className="block font-bold">{right.label}</span>
                          <span className="mt-0.5 block leading-5">{right.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Meeting Invitation Templates Box */}
        <div className="rounded-2xl border border-[#26352f]/30 bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>✉️</span> Default Meeting Invitation Message Templates
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            The message members receive when you schedule a Business or Board meeting. Each placeholder is
            filled in per member as the message is sent.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#617068]">
            {invitationPlaceholders.map((placeholder) => (
              <li key={placeholder.token}>
                <code className="rounded border border-[#dfdbd1] bg-white px-1 py-0.5 text-[#b36b3c]">
                  {placeholder.token}
                </code>{" "}
                {placeholder.description}
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">
                Church Business Meeting Invitation Template
              </label>
              <textarea
                rows={3}
                value={defaultBusinessMeetingInvitationMessage}
                onChange={(e) => setDefaultBusinessMeetingInvitationMessage(e.target.value)}
                placeholder="Message sent to all church members..."
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#26352f]">
                Church Board Meeting Invitation Template
              </label>
              <textarea
                rows={3}
                value={defaultBoardMeetingInvitationMessage}
                onChange={(e) => setDefaultBoardMeetingInvitationMessage(e.target.value)}
                placeholder="Message sent to church board members..."
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
              />
            </div>
          </div>
        </div>

        {/* Dashboard encouragement */}
        <div className="rounded-2xl border border-[#26352f]/30 bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>💬</span> Dashboard Greeting Line
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Shown under &quot;Good morning, [name].&quot; on every member&apos;s dashboard. Keep it to one short line — two
            lines at most on a phone.
          </p>
          <input
            type="text"
            maxLength={ENCOURAGEMENT_MAX}
            value={encouragementLine}
            onChange={(e) => setEncouragementLine(e.target.value.slice(0, ENCOURAGEMENT_MAX))}
            placeholder="e.g. Jesus is coming again."
            className="mt-3 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#26352f]"
          />
          <p className="mt-1 text-right text-[11px] text-[#617068]">
            {encouragementLine.length}/{ENCOURAGEMENT_MAX}
          </p>
        </div>

        {/* Legal documents */}
        <div className="rounded-2xl border border-[#26352f]/30 bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>⚖️</span> Privacy Policy &amp; Terms of Use
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Your own wording for the two legal pages. Separate paragraphs with a blank line. Leave a box empty and the
            public page keeps the built-in document.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Privacy Policy</label>
              <textarea
                rows={8}
                value={privacyPolicy}
                onChange={(e) => setPrivacyPolicy(e.target.value)}
                placeholder="Shown at /privacy. Start with who the church is, then what you collect and how you use it..."
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 font-mono text-xs leading-6 outline-none focus:border-[#26352f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#26352f]">Terms of Use</label>
              <textarea
                rows={8}
                value={termsOfUse}
                onChange={(e) => setTermsOfUse(e.target.value)}
                placeholder="Shown at /terms. Cover accounts, acceptable use, giving and changes to the terms..."
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 font-mono text-xs leading-6 outline-none focus:border-[#26352f]"
              />
            </div>
          </div>
        </div>

        {/* General Church Details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Church Name
            </label>
            <input
              type="text"
              required
              value={churchName}
              onChange={(e) => setChurchName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Physical Address
            </label>
            <input
              type="text"
              placeholder="e.g. Off Ngong Road, Meru"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>
        </div>

        {/* Church GPS Location & Map Picker */}
        <div className="rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>📍</span> Church Location Map Pin &amp; GPS
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Capture current GPS position or drop a pin on the map to set exact church coordinates for Google Maps navigation.
          </p>
          <div className="mt-4">
            <LocationMapPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
              onClear={() => {
                setLatitude(null);
                setLongitude(null);
              }}
            />
          </div>
        </div>

        {/* Service Times & Links */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Midweek Vespers Time
            </label>
            <input
              type="text"
              value={midweekVespersTime}
              onChange={(e) => setMidweekVespersTime(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Friday Vespers Time
            </label>
            <input
              type="text"
              value={fridayVespersTime}
              onChange={(e) => setFridayVespersTime(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Sabbath Worship Time
            </label>
            <input
              type="text"
              value={sabbathTime}
              onChange={(e) => setSabbathTime(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Live Stream URL (YouTube / Zoom)
            </label>
            <input
              type="url"
              placeholder="https://youtube.com/..."
              value={liveServiceLink}
              onChange={(e) => setLiveServiceLink(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26352f]">
              Invitation Link Lifetime (days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              required
              value={invitationLinkLifetimeDays}
              onChange={(e) => setInvitationLinkLifetimeDays(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
            />
            <p className="mt-1 text-[11px] text-[#617068]">
              How many days an emailed invitation link stays usable before it expires.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#b36b3c] px-7 py-3 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
        >
          {saving ? "Saving Settings..." : "Save Church Settings"}
        </button>
      </form>
    </section>
  );
}
