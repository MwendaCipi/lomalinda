"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type TransferDirection = "transfer_in" | "transfer_out";
export type JoiningMode = "baptism" | "membership_transfer" | "friend" | "sabbath_school";

const inputClass = "mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]";

function parseFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  const last_name = parts[parts.length - 1];
  const first_name = parts.slice(0, -1).join(" ");
  return { first_name, last_name };
}

const emptyForm = {
  email: "",
  name: "",
  phone_number: "",
  residence: "",
  current_church: "",
  destination_church: "",
  transfer_reason: "",
};

type EnrollmentFormProps = {
  /** Requests page: let the visitor pick transfer in / transfer out. Sign-up hides it. */
  allowTransferOut?: boolean;
  /** Sign-up: lead with the joining choice, which decides which fields follow. */
  showAccountTypeChoice?: boolean;
  initialJoiningMode?: JoiningMode;
  /** Called after a successful submission so the host page can refresh its list. */
  onSubmitted?: (kind: "enrollment" | "transfer_out") => void;
};

export function EnrollmentForm({
  allowTransferOut = false,
  showAccountTypeChoice = false,
  initialJoiningMode = "membership_transfer",
  onSubmitted,
}: EnrollmentFormProps) {
  const router = useRouter();
  const [transferDirection, setTransferDirection] = useState<TransferDirection>("transfer_in");
  const [joiningMode, setJoiningMode] = useState<JoiningMode>(initialJoiningMode);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  /** After the verification email lands, the code entry replaces the details. */
  const [codeStage, setCodeStage] = useState(false);
  const [codeValue, setCodeValue] = useState("");

  /**
   * "A church member" is somebody already on a church roll who is asking to be
   * added to this one. How they are joining, where they live and which church
   * they came from are questions that only make sense for someone arriving from
   * outside, so the member path asks none of them: the request itself is the
   * answer. The enrolment desk on the Requests page still asks all three, where
   * the office is recording a transfer rather than granting a request.
   */
  const isExistingMember = showAccountTypeChoice && joiningMode === "membership_transfer";
  const asksCurrentChurch =
    !isExistingMember &&
    (joiningMode === "membership_transfer" || joiningMode === "friend" || joiningMode === "sabbath_school");

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  /** Start over: empty fields and no stale message; the consent choice stays. */
  function clearForm() {
    setForm(emptyForm);
    setMessage("");
    setCodeStage(false);
    setCodeValue("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Step 2 (code typed): the details are already with the office — carry the
    // code to the setup page, where phone and sign-in details are asked.
    if (codeStage && transferDirection === "transfer_in") {
      const clean = codeValue.trim().toUpperCase();
      if (!clean) {
        showAlert("Code required", "Enter the verification code from your email to continue.", "warning");
        return;
      }
      router.push(`/enroll/confirm?code=${encodeURIComponent(clean)}`);
      return;
    }
    if (!termsAccepted) {
      showAlert("Terms required", "Please accept the Privacy Policy and Terms of Use before continuing.", "warning");
      return;
    }
    if (!form.name.trim() || !form.phone_number.trim() || !form.email.trim()) {
      showAlert("Missing information", "Please fill in your name, phone number, and email address.", "warning");
      return;
    }
    const cleanPhone = form.phone_number.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      showAlert("Invalid Phone Number", "Please enter a valid 10-digit phone number (e.g., 0712345678).", "warning");
      return;
    }

    if (transferDirection === "transfer_in") {
      if (asksCurrentChurch && !form.current_church.trim()) {
        showAlert("Missing information", "Please specify the name of your current/previous church.", "warning");
        return;
      }
      const { first_name, last_name } = parseFullName(form.name);
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch(`${API_URL}/api/members/auth/enrollment-request/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            first_name,
            last_name,
            phone_number: cleanPhone,
            email: form.email.trim(),
            joining_mode: joiningMode,
            residence: form.residence.trim(),
            current_church: form.current_church.trim(),
            privacy_accepted: true,
            terms_accepted: termsAccepted,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to submit your request.");
        const successMsg =
          data.message ||
          "A verification code has been sent to your email. Enter it below to continue your account setup.";
        setMessage(successMsg);
        showAlert("Verification Code Sent", successMsg, "success");
        setCodeStage(true);
        setForm(emptyForm);
        onSubmitted?.("enrollment");
      } catch (error) {
        const text = error instanceof Error ? error.message : "Unable to submit your enrollment request.";
        setMessage(text);
        showAlert("Submission error", text, "error");
      } finally {
        setLoading(false);
      }
    } else {
      if (!form.destination_church.trim()) {
        showAlert("Missing information", "Please specify the destination church.", "warning");
        return;
      }
      if (!form.transfer_reason.trim()) {
        showAlert("Missing information", "Please state your reason for requesting a transfer out.", "warning");
        return;
      }
      setLoading(true);
      setMessage("");
      try {
        const endpoint = `${API_URL}/api/members/transfers/`;
        const payload = {
          name: form.name.trim(),
          member_name: form.name.trim(),
          transfer_type: "outgoing",
          other_church: form.destination_church.trim(),
          reason: form.transfer_reason.trim(),
          phone_number: cleanPhone,
          email: form.email.trim(),
        };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to submit your request.");
        const text = "Your transfer-out request has been received. The church office will be in touch.";
        setMessage(text);
        showAlert("Request Received", text, "success");
        setForm(emptyForm);
        onSubmitted?.("transfer_out");
      } catch (error) {
        const text = error instanceof Error ? error.message : "Unable to submit your request.";
        setMessage(text);
        showAlert("Request error", text, "error");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && <p className="rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}

      {/* Step 2: the verification code from the email. The consent box belongs
          here rather than on step 1 — the server records the agreement when
          the account is completed, so asking on the code step keeps the two
          forms' consent wording identical (one sentence, both documents). */}
      {codeStage && transferDirection === "transfer_in" && (
        <div className="space-y-4 pt-2">
          <label className="block text-sm font-medium">
            Verification code
            <input
              required
              autoFocus
              autoComplete="one-time-code"
              placeholder="ABCD-EFGH"
              value={codeValue}
              onChange={(event) => setCodeValue(event.target.value)}
              className={inputClass}
            />
          </label>
          <p className="text-xs leading-5 text-[#617068]">
            Type the code from the email we just sent — then continue below to add your phone number and sign-in details.
          </p>
          <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#5f8067]" />
            <span>I agree to the <a href="/privacy" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Privacy Policy</a> and <a href="/terms" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Terms of Use</a>.</span>
          </label>
        </div>
      )}

      {!codeStage && (
      <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#5f8067]" />
        <span>I agree to the <a href="/privacy" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Privacy Policy</a> and <a href="/terms" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Terms of Use</a>.</span>
      </label>
      )}

      {allowTransferOut && (
        <div>
          <label className="block text-sm font-semibold text-[#26352f]">Transfer Direction / Request Type</label>
          <select
            value={transferDirection}
            onChange={(e) => {
              setTransferDirection(e.target.value as TransferDirection);
              setMessage("");
            }}
            className="mt-1.5 w-full rounded-xl border border-[#b36b3c] bg-[#f7f4ee] px-4 py-3 text-sm font-semibold text-[#26352f] outline-none focus:ring-2 focus:ring-[#b36b3c]"
          >
            <option value="transfer_in">Transfer In — Join SDA Loma Linda</option>
            <option value="transfer_out">Transfer Out — Move to Another Church</option>
          </select>
        </div>
      )}

      {/* Two fields to a row on anything wider than a phone. The joining choice
          leads, beside the name: it decides which fields follow below. */}
      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        {showAccountTypeChoice && (
          <label className="block text-sm font-medium">
            I am joining as
            <select
              value={joiningMode}
              onChange={(event) => {
                setJoiningMode(event.target.value as JoiningMode);
                setMessage("");
              }}
              className={inputClass}
            >
              <option value="baptism">Baptism / New member</option>
              <option value="membership_transfer">A church member</option>
              <option value="friend">A friend of the church</option>
              <option value="sabbath_school">A Sabbath School attendee</option>
            </select>
          </label>
        )}

        {!showAccountTypeChoice && transferDirection === "transfer_in" && (
          <label className="block text-sm font-medium">
            Mode of Joining
            <select
              value={joiningMode}
              onChange={(event) => setJoiningMode(event.target.value as JoiningMode)}
              className={inputClass}
            >
              <option value="baptism">Baptism</option>
              <option value="membership_transfer">Membership Transfer</option>
              <option value="friend">Friend of SDA Loma Linda</option>
              <option value="sabbath_school">Sabbath School</option>
            </select>
          </label>
        )}

        <label className="block text-sm font-medium">
          Full Name
          <input
            required
            placeholder="Enter full name (e.g. John Doe)"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium">
          Phone Number
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            maxLength={10}
            minLength={10}
            required
            placeholder="e.g. 0712345678 (10 digits)"
            value={form.phone_number}
            onChange={(event) => update("phone_number", event.target.value.replace(/\D/g, "").slice(0, 10))}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium">
          Email Address
          <input
            required
            type="email"
            placeholder="yourname@example.com"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            className={inputClass}
          />
        </label>

        {transferDirection === "transfer_in" && (
          <>
            {/* Existing members: no mode, no residence, no previous church. */}
            {!isExistingMember && (
              <label className="block text-sm font-medium">
                Residence
                <input
                  value={form.residence}
                  onChange={(event) => update("residence", event.target.value)}
                  className={inputClass}
                  placeholder="Estate, street or town (optional)"
                />
              </label>
            )}

            {asksCurrentChurch && (
              <label className="block text-sm font-medium">
                Current / Previous Church Name
                <input
                  required
                  value={form.current_church}
                  onChange={(event) => update("current_church", event.target.value)}
                  className={inputClass}
                  placeholder="Name of your current or former SDA church"
                />
              </label>
            )}
          </>
        )}

        {transferDirection === "transfer_out" && (
          <>
            <label className="block text-sm font-medium sm:col-span-2">
              Destination Church Name
              <input
                required
                placeholder="Name of destination church"
                value={form.destination_church}
                onChange={(event) => update("destination_church", event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium sm:col-span-2">
              Reason for Transfer
              <textarea
                required
                rows={3}
                value={form.transfer_reason}
                onChange={(event) => update("transfer_reason", event.target.value)}
                className={inputClass}
                placeholder="Tell us why you are requesting the transfer..."
              />
            </label>
          </>
        )}
      </div>

      {transferDirection === "transfer_in" ? (
        <div className="grid grid-cols-2 gap-3 pt-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#5f8067] px-5 font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
          >
            {loading ? "Sending..." : codeStage ? "Verify code" : "Verify via Email"}
          </button>
          <button
            type="button"
            onClick={clearForm}
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#26352f] bg-white px-5 font-semibold text-[#26352f] transition hover:bg-[#eae6de] disabled:opacity-60"
          >
            Clear form
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#9a741c] px-5 font-semibold text-white transition hover:bg-[#7c5d16] disabled:opacity-60"
          >
            {loading ? "Sending..." : "Request Transfer Out"}
          </button>
        </div>
      )}
    </form>
  );
}
