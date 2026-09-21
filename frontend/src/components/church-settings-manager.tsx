"use client";

import { FormEvent, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { showAlert } from "@/lib/alerts";
import { ROLE_OPTIONS, SYSTEM_ROLE_CODES, SYSTEM_ROLE_HELP } from "./roles-combobox";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Board roles are chosen from the same hard-coded role list as everywhere else.
const AVAILABLE_ROLES = ROLE_OPTIONS.map((role) => ({ key: role.value, label: role.label, system: role.system }));

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
  const [clarionCallSubtext, setClarionCallSubtext] = useState("Join SDA Loma Linda, Meru as we study God's Word, support one another, and reach out to our community with faith and compassion.");
  const [defaultReceiptMessage, setDefaultReceiptMessage] = useState("Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!");
  const [defaultBusinessMeetingInvitationMessage, setDefaultBusinessMeetingInvitationMessage] = useState(
    "Dear member, you are warmly invited to our upcoming Church Business Meeting: '{title}' on {meeting_date} at {location}. Your presence and active participation are highly valued!"
  );
  const [defaultBoardMeetingInvitationMessage, setDefaultBoardMeetingInvitationMessage] = useState(
    "Dear Church Board Member, you are hereby invited to attend the Church Board Meeting: '{title}' scheduled for {meeting_date} at {location}. Please review the agendas and attached documents."
  );
  const [boardRoles, setBoardRoles] = useState<string[]>([
    "elder", "clerk", "treasurer", "leader", "finance", "admin"
  ]);
  const [bankName, setBankName] = useState("KCB Bank Kenya");
  const [bankAccountName, setBankAccountName] = useState("SDA Church Main Account");
  const [bankAccountNumber, setBankAccountNumber] = useState("1122334455");
  const [bankBranch, setBankBranch] = useState("Meru");
  const [bankSwiftCode, setBankSwiftCode] = useState("KCBKNEN");
  const [bankPaybillNumber, setBankPaybillNumber] = useState("522522");
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
          if (data.default_business_meeting_invitation_message) {
            setDefaultBusinessMeetingInvitationMessage(data.default_business_meeting_invitation_message);
          }
          if (data.default_board_meeting_invitation_message) {
            setDefaultBoardMeetingInvitationMessage(data.default_board_meeting_invitation_message);
          }
          if (Array.isArray(data.board_roles)) {
            setBoardRoles(data.board_roles);
          }
          if (data.bank_name) setBankName(data.bank_name);
          if (data.bank_account_name) setBankAccountName(data.bank_account_name);
          if (data.bank_account_number) setBankAccountNumber(data.bank_account_number);
          if (data.bank_branch) setBankBranch(data.bank_branch);
          if (data.bank_swift_code) setBankSwiftCode(data.bank_swift_code);
          if (data.bank_paybill_number) setBankPaybillNumber(data.bank_paybill_number);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleBoardRole = (roleKey: string) => {
    setBoardRoles((prev) =>
      prev.includes(roleKey) ? prev.filter((r) => r !== roleKey) : [...prev, roleKey]
    );
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
        // System roles always stay on the board, whatever the tick boxes say.
        board_roles: Array.from(new Set([...boardRoles, ...SYSTEM_ROLE_CODES])),
        bank_name: bankName,
        bank_account_name: bankAccountName,
        bank_account_number: bankAccountNumber,
        bank_branch: bankBranch,
        bank_swift_code: bankSwiftCode,
        bank_paybill_number: bankPaybillNumber,
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
            <label className="block text-xs font-semibold text-[#26352f]">
              Receipt Thank-You Message
            </label>
            <p className="mt-0.5 text-xs text-[#617068]">
              Supports placeholders: <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{name}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{amount}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{purpose}"}</code>
            </p>
            <textarea
              rows={3}
              value={defaultReceiptMessage}
              onChange={(e) => setDefaultReceiptMessage(e.target.value)}
              placeholder="e.g. Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!"
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

        {/* Board Roles Configuration Box */}
        <div className="rounded-2xl border border-[#b36b3c]/30 bg-[#faf7f2] p-5">
          <h3 className="text-base font-bold text-[#b36b3c] flex items-center gap-2">
            <span>🛡️</span> Church Board Roles Configuration
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Select which church leadership roles automatically belong to the Church Board. Board meeting invitations and notifications will be sent to members holding these roles.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AVAILABLE_ROLES.map((roleObj) => {
              // Administrator is a system role, so it always sits on the board.
              const isChecked = roleObj.system || boardRoles.includes(roleObj.key);
              return (
                <label
                  key={roleObj.key}
                  title={roleObj.system ? SYSTEM_ROLE_HELP : undefined}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 transition text-xs font-semibold ${
                    roleObj.system ? "cursor-not-allowed" : "cursor-pointer"
                  } ${
                    isChecked
                      ? "border-[#b36b3c] bg-white text-[#26352f] shadow-sm"
                      : "border-[#dfdbd1] bg-[#f7f4ee]/60 text-[#617068] hover:border-[#b36b3c]/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={roleObj.system}
                    onChange={() => toggleBoardRole(roleObj.key)}
                    className="h-4 w-4 rounded border-[#c9c5bb] text-[#b36b3c] focus:ring-[#b36b3c] disabled:cursor-not-allowed"
                  />
                  <span>{roleObj.label}</span>
                  {roleObj.system && (
                    <span className="rounded bg-[#f0e6dc] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#96552c]">
                      system
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Meeting Invitation Templates Box */}
        <div className="rounded-2xl border border-[#26352f]/30 bg-[#f7f4ee] p-5">
          <h3 className="text-base font-bold text-[#26352f] flex items-center gap-2">
            <span>✉️</span> Default Meeting Invitation Message Templates
          </h3>
          <p className="mt-1 text-xs text-[#617068]">
            Configure default invitation message text for Business and Board Meetings. Supports placeholders: <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{title}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{meeting_date}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{meeting_time}"}</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#dfdbd1] text-[#b36b3c]">{"{location}"}</code>.
          </p>

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
