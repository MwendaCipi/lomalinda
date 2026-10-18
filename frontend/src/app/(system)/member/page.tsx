"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { kenyaCounties } from "@/config/kenya-counties";
import { getPushState, PushSupport } from "@/lib/push";
import { useAccessibility } from "@/context/accessibility-context";
import type { ThemeChoice } from "@/lib/theme";
import { offlineFetch } from "@/lib/offline-fetch";
import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { patchCachedMe, useHeaderData } from "@/hooks/use-header-data";
import { useAllDepartments } from "@/hooks/use-departments";
import { AreaJoinModal } from "@/components/area-modals";
import { SignatureCard } from "@/components/signature-card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Details = { date_of_birth: string; county_of_birth: string; education_level: string; profession: string; residence: string; current_church: string };

/** One person this member is related to, as the profile keeps it: an
    account when the roll found them, a name alone otherwise. */
type DeclaredRelationship = { person_id?: number | null; name: string; relationship: string };

/** The church's short list — anything rarer is Other. */
const RELATIONSHIP_CHOICES = [
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "child", label: "Child" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

export default function MemberPage() {
  const { theme, setTheme } = useAccessibility();
  // The header's identity read, reused rather than fetched twice: the join
  // picker needs the roles to know whether Treasury is theirs to knock on.
  const { me: headerMe } = useHeaderData();
  // The church's whole directory of areas — the labels behind the ministry
  // and department rows below, and the list the join picker draws from.
  const directory = useAllDepartments();
  const [details, setDetails] = useState<Details | null>(null);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [detailsMessage, setDetailsMessage] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [announcePrefs, setAnnouncePrefs] = useState<{ email: boolean; push: boolean } | null>(null);
  const [pushSupport, setPushSupport] = useState<PushSupport | null>(null);
  const [prefMessage, setPrefMessage] = useState("");

  // The contact line: the member's own to change, same validation the
  // office edit gets — no appointment needed to say the number moved. The
  // address is here for the same reason: receipts are sent to whatever the
  // account carries, so a member with none could never receive one.
  const [phone, setPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");

  // Email verification when changing email
  const [pendingEmail, setPendingEmail] = useState("");
  const [showEmailVerifyModal, setShowEmailVerifyModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [requestingCode, setRequestingCode] = useState(false);

  // Profile picture removal confirmation prompt
  const [showRemovePhotoPrompt, setShowRemovePhotoPrompt] = useState(false);

  // Who the account is: the name on file and the picture they show beside it.
  // Sex rides along read-only — the church's record, changeable only by the
  // office — so the profile shows it without offering to write it.
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  // The signature an officer signs the church's paper with. Only the offices
  // that sign — the treasurer and the first elder — are offered the card; the
  // office label arrives with it, so the page never repeats the rule.
  const [signatureUrl, setSignatureUrl] = useState("");
  const [signatureOffice, setSignatureOffice] = useState("");

  // The church's own record of this member's service: the gifts and talents
  // they serve with, and the department and ministries they belong to. Read
  // with identity below, shown on the card under the header.
  const [churchLife, setChurchLife] = useState<{
    gifts: string;
    departmentRef: string;
    department: string;
    ministries: string[];
    ties: string[];
  } | null>(null);
  const [joinMinistryOpen, setJoinMinistryOpen] = useState(false);

  // The people this member gives for or asks to give: declared here once,
  // read by the giving form instead of being asked on every gift.
  const [relationships, setRelationships] = useState<DeclaredRelationship[]>([]);
  const [relSaving, setRelSaving] = useState(false);
  const [relMessage, setRelMessage] = useState("");
  const [relQuery, setRelQuery] = useState("");
  const [relMatches, setRelMatches] = useState<{ id: number; name: string }[]>([]);
  const [pickedForAdd, setPickedForAdd] = useState<{ id?: number; name: string } | null>(null);
  const [newRelationship, setNewRelationship] = useState("");

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/api/members/me/`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setAnnouncePrefs({ email: !!data.announce_email, push: !!data.announce_push });
          setPhone(data.phone_number || "");
          setRelationships(Array.isArray(data.declared_relationships) ? data.declared_relationships : []);
          setDisplayName([data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || "");
          setEmail(data.email || "");
          setOriginalEmail(data.email || "");
          setPendingEmail(data.pending_email_change || "");
          setGender(data.gender || "");
          setPhotoUrl(data.photo_url || "");
          setSignatureUrl(data.signature_url || "");
          setSignatureOffice(data.signature_office || "");
          setChurchLife({
            gifts: typeof data.gifts === "string" ? data.gifts : "",
            departmentRef: typeof data.department_ref === "string" ? data.department_ref : "",
            department: typeof data.department === "string" ? data.department : "",
            ministries: Array.isArray(data.ministries) ? data.ministries.map(String) : [],
            ties: Array.isArray(data.my_ties) ? data.my_ties.map(String) : [],
          });
        }
      })
      .catch(() => {});
    getPushState().then(setPushSupport).catch(() => setPushSupport(null));
  }, [token]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showRemovePhotoPrompt && !photoSaving) setShowRemovePhotoPrompt(false);
        if (showEmailVerifyModal && !verifyingCode) setShowEmailVerifyModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRemovePhotoPrompt, photoSaving, showEmailVerifyModal, verifyingCode]);

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPhoneSaving(true);
    setPhoneMessage("");
    try {
      const emailChanged = email.trim().toLowerCase() !== originalEmail.trim().toLowerCase();

      // If phone changed or address was explicitly cleared, send PATCH to me/
      const payload: Record<string, string> = { phone_number: phone.trim() };
      if (email.trim() === "" && originalEmail) {
        payload.email = "";
      }
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.phone_number || data?.email || data?.detail || "Your contact details could not be saved.");
      }
      setPhone(data?.phone_number ?? phone.trim());
      if (email.trim() === "" && originalEmail) {
        setEmail("");
        setOriginalEmail("");
        setPendingEmail("");
        patchCachedMe({ email: "" });
      }

      // If email changed to a new address, trigger verification
      if (emailChanged && email.trim() !== "") {
        const reqResponse = await fetch(`${API_URL}/api/members/me/email-change/request/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: email.trim() }),
        });
        const reqData = await reqResponse.json().catch(() => null);
        if (!reqResponse.ok) {
          throw new Error(reqData?.email || reqData?.detail || "Unable to request email verification.");
        }
        setPendingEmail(email.trim());
        setShowEmailVerifyModal(true);
        setVerificationCode("");
        setVerifyError("");
        const msg = `Verification code sent to ${email.trim()}. Enter it to confirm your new email.`;
        setPhoneMessage(msg);
        showAlert("Verification code sent", msg, "info");
      } else if (!emailChanged) {
        const successMsg = "Your contact details have been saved.";
        setPhoneMessage(successMsg);
        showAlert("Contact details saved", successMsg, "success");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your contact details could not be saved.";
      setPhoneMessage(errorMsg);
      showAlert("Not saved", errorMsg, "error");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function verifyEmailChange(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!token || !verificationCode.trim()) return;
    setVerifyingCode(true);
    setVerifyError("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/email-change/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: verificationCode.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.code || data?.detail || "Verification failed. Check the code and try again.");
      }
      const updatedEmail = data.email || pendingEmail;
      setEmail(updatedEmail);
      setOriginalEmail(updatedEmail);
      setPendingEmail("");
      setShowEmailVerifyModal(false);
      setVerificationCode("");
      patchCachedMe({ email: updatedEmail });
      showAlert("Email verified", "Your email address has been successfully verified and updated.", "success");
      setPhoneMessage("Your email address has been updated.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Verification failed.";
      setVerifyError(msg);
    } finally {
      setVerifyingCode(false);
    }
  }

  async function resendEmailCode() {
    if (!token || !pendingEmail) return;
    setRequestingCode(true);
    setVerifyError("");
    try {
      const res = await fetch(`${API_URL}/api/members/me/email-change/request/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.email || data?.detail || "Could not resend verification code.");
      }
      showAlert("Code resent", `A new verification code was sent to ${pendingEmail}.`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not resend code.";
      setVerifyError(msg);
    } finally {
      setRequestingCode(false);
    }
  }

  async function cancelEmailChange() {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/members/me/email-change/cancel/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    setPendingEmail("");
    setShowEmailVerifyModal(false);
    setVerificationCode("");
    setVerifyError("");
    setEmail(originalEmail);
    showAlert("Cancelled", "Email change request has been cancelled.", "info");
  }

  /** The picture: posted as the file it is, then read back by its new URL.
      The header's cached identity is patched in the same breath, so the bar    at the top of the app shows the new face without waiting for a reload. */
  async function savePhoto(file: File | null) {
    if (!token || !file) return;
    setPhotoSaving(true);
    setPhotoMessage("");
    try {
      const body = new FormData();
      body.append("photo", file);
      const response = await fetch(`${API_URL}/api/members/me/photo/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.photo || data?.detail || "Your picture could not be saved.");
      }
      const url = data?.photo_url ?? "";
      setPhotoUrl(url);
      patchCachedMe({ photo_url: url });
      const successMsg = "Your picture has been saved.";
      setPhotoMessage(successMsg);
      showAlert("Picture saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your picture could not be saved.";
      setPhotoMessage(errorMsg);
      showAlert("Not saved", errorMsg, "error");
    } finally {
      setPhotoSaving(false);
    }
  }

  /** Taking the picture down returns the bar to the initial it draws. */
  async function removePhoto() {
    if (!token) return;
    setPhotoSaving(true);
    setPhotoMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/photo/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Your picture could not be removed.");
      setPhotoUrl("");
      patchCachedMe({ photo_url: "" });
      const successMsg = "Your picture has been removed.";
      setPhotoMessage(successMsg);
      showAlert("Picture removed", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your picture could not be removed.";
      setPhotoMessage(errorMsg);
      showAlert("Not removed", errorMsg, "error");
    } finally {
      setPhotoSaving(false);
    }
  }

  /** Debounced roll search while adding a person: a keystroke schedules the
      lookup, the previous one is cancelled, and nothing sets state until the
      answer lands. */
  const relSearchTimer = useRef<number | null>(null);
  const searchPersonToAdd = (raw: string) => {
    setRelQuery(raw);
    setPickedForAdd(null);
    if (relSearchTimer.current) window.clearTimeout(relSearchTimer.current);
    const query = raw.trim();
    if (query.length < 2) {
      setRelMatches([]);
      return;
    }
    relSearchTimer.current = window.setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setRelMatches(Array.isArray(data?.matches) ? data.matches : []))
        .catch(() => setRelMatches([]));
    }, 250);
  };

  const addRelationship = () => {
    const person = pickedForAdd || (relQuery.trim() ? { name: relQuery.trim() } : null);
    if (!person) {
      showAlert("Name needed", "Type a name, or pick the person from the list as you type.", "warning");
      return;
    }
    if (!newRelationship) {
      showAlert("Relationship needed", "Say how this person relates to you.", "warning");
      return;
    }
    const already = relationships.some((row) =>
      person.id && row.person_id ? row.person_id === person.id : (row.name || "").trim().toLowerCase() === person.name.trim().toLowerCase()
    );
    if (already) {
      showAlert("Already listed", "This person is already among your relationships.", "warning");
      return;
    }
    setRelationships([...relationships, { person_id: person.id ?? null, name: person.name, relationship: newRelationship }]);
    setRelQuery("");
    setRelMatches([]);
    setPickedForAdd(null);
    setNewRelationship("");
    setRelMessage("");
  };

  async function saveRelationships() {
    if (!token) return;
    setRelSaving(true);
    setRelMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ declared_relationships: relationships }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.declared_relationships || data?.detail || "Your relationships could not be saved.");
      }
      setRelationships(Array.isArray(data?.declared_relationships) ? data.declared_relationships : relationships);
      const successMsg = "Your relationships have been saved.";
      setRelMessage(successMsg);
      showAlert("Relationships saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your relationships could not be saved.";
      setRelMessage(errorMsg);
      showAlert("Not saved", errorMsg, "error");
    } finally {
      setRelSaving(false);
    }
  }

  async function saveAnnouncePref(field: "email" | "push", value: boolean) {
    if (!announcePrefs) return;
    const previous = announcePrefs;
    setAnnouncePrefs({ ...announcePrefs, [field]: value });
    setPrefMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(field === "email" ? { announce_email: value } : { announce_push: value }),
      });
      if (!response.ok) throw new Error();
      setPrefMessage("Preference saved.");
    } catch {
      setAnnouncePrefs(previous);
      showAlert("Not saved", "Your preference could not be saved. Try again.", "error");
    }
  }

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    offlineFetch<Details>(`${API_URL}/api/members/me/enrollment-details/`, { headers }).then((detailsResult) => {
      if (detailsResult.ok && detailsResult.data) setDetails(detailsResult.data);
    });
  }, [token]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !details) return;
    setSavingDetails(true);
    setDetailsMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/enrollment-details/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(details)
      });
      if (!response.ok) throw new Error("Unable to save your details.");
      setDetails(await response.json());
      const successMsg = "Your additional details have been saved.";
      setDetailsMessage(successMsg);
      showAlert("Details Saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to save your details.";
      setDetailsMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    } finally {
      setSavingDetails(false);
    }
  }

  // ── The card below the header: gifts, department, ministry ──────────────
  // The record speaks in area codes; the directory speaks in the names
  // members read ("Adventist Youth", not "aym"). A code the directory does
  // not carry yet still reads as words rather than as itself.
  const labelOf = (code: string) =>
    directory.find((row) => row.code === code)?.label ??
    code.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  // The one department the profile files them under — the real record first,
  // the legacy age-bucket string beside it for an account never re-filed.
  const LEGACY_DEPARTMENT_CODES: Record<string, string> = { young_adults: "aym" };
  const departmentCode = churchLife
    ? churchLife.departmentRef ||
      LEGACY_DEPARTMENT_CODES[churchLife.department] ||
      churchLife.department ||
      ""
    : "";

  // Their ministries: the areas named as theirs, kept to the ones the
  // directory files under Ministries — a tie the church has since re-filed
  // out of the heading stops reading as a ministry here too. The M2M picks
  // survive even when the directory read has not landed yet.
  const ministryCodes = churchLife
    ? Array.from(new Set([...churchLife.ministries, ...churchLife.ties])).filter((code) => {
        const row = directory.find((entry) => entry.code === code);
        return row ? row.group === "ministry" : churchLife.ministries.includes(code);
      })
    : [];

  // Gifts arrive as one comma-joined line, the way the office writes them.
  const giftList = (churchLife?.gifts ?? "")
    .split(",")
    .map((gift) => gift.trim())
    .filter(Boolean);

  // What the join picker may not offer: everything they are already part of,
  // the Treasury (held by office — the same gate the Ministry map keeps),
  // and the two sex-only fellowships that are not theirs to ask for.
  const headerRoles =
    Array.isArray(headerMe?.roles) && headerMe.roles.length > 0 ? headerMe.roles : [headerMe?.role || "member"];
  const holdsTreasury = headerRoles.some((role) => role === "treasurer" || role === "admin");
  const SEX_ONLY_AREAS: Record<string, "male" | "female"> = { amm: "male", awm: "female" };
  const recordedSex = gender.trim().toLowerCase();
  const joinExclude = Array.from(
    new Set([
      ...(churchLife?.ties ?? []),
      ...(churchLife?.ministries ?? []),
      ...(holdsTreasury ? [] : ["treasury"]),
      ...Object.keys(SEX_ONLY_AREAS).filter((code) => recordedSex && SEX_ONLY_AREAS[code] !== recordedSex),
    ])
  );
  const joinExcludeSet = new Set(joinExclude);
  // A member already in every ministry the church runs should not meet a
  // button that opens an empty picker. While the directory is still
  // loading the count is unknown, so the button stays open.
  const ministriesToOffer = directory.filter((row) => row.group === "ministry" && !joinExcludeSet.has(row.code));

  return (
    <main className="min-h-full bg-sand text-bark">
      <div className="p-4 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <div className="flex flex-wrap items-center gap-5">
              {photoUrl ? (
                // Plain img: the picture is a same-origin upload, the way
                // every other photo in the app is shown.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveAttachmentUrl(photoUrl)}
                  alt={displayName || "Your picture"}
                  className="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-sand-line"
                />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ember text-2xl font-bold text-white">
                  {(displayName || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">{displayName || "Your profile"}</h2>
                <p className="mt-0.5 break-all text-sm text-moss">{email || "No email address on file"}</p>
                <p className="mt-2 text-xs text-moss">
                  <span className="font-semibold text-bark">Sex:</span>{" "}
                  {gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : "Not on record"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`cursor-pointer rounded-full bg-sage px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 ${photoSaving ? "opacity-60" : ""}`}
                >
                  {photoSaving ? "Saving..." : photoUrl ? "Change picture" : "Add picture"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={photoSaving}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      // Clearing lets the same picture be re-picked after a    // failed attempt, instead of the input swallowing the change.
                      event.target.value = "";
                      void savePhoto(file);
                    }}
                  />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    disabled={photoSaving}
                    onClick={() => setShowRemovePhotoPrompt(true)}
                    className="rounded-full border border-sand-line px-5 py-2.5 text-sm font-semibold text-moss transition hover:border-ember hover:text-ember disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {photoMessage && <p className="mt-3 text-sm text-moss">{photoMessage}</p>}
          </section>

          {/* The officers who sign the church's paper keep their signature
              here: uploaded from a signed slip, or drawn on the pad. */}
          {signatureOffice && (
            <SignatureCard token={token} office={signatureOffice} signatureUrl={signatureUrl} />
          )}

          {/* The church's record of this member's service — gifts, the
              department they are filed under, and the ministries they serve
              in — read with identity and shown before the forms, with the
              one way to ask for a ministry they are not yet on. */}
          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">Gifts &amp; ministry</h2>
                <p className="mt-2 text-sm leading-6 text-moss">
                  What the church has on record for you: the gifts and talents you serve with, and
                  the department and the ministries you belong to.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJoinMinistryOpen(true)}
                disabled={directory.length > 0 && ministriesToOffer.length === 0}
                className="shrink-0 rounded-full bg-bark px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember disabled:opacity-50"
              >
                Join a ministry
              </button>
            </div>
            {!churchLife ? (
              <p className="mt-5 text-sm text-moss">Loading…</p>
            ) : (
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ember">
                    Gifts &amp; talents
                  </h3>
                  {giftList.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {giftList.map((gift) => (
                        <li
                          key={gift}
                          className="rounded-full bg-sand px-2.5 py-1 text-xs font-semibold text-bark"
                        >
                          {gift}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-moss">
                      Not on record yet — the office adds these when they are known.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ember">Department</h3>
                  {departmentCode ? (
                    <p className="mt-2 text-sm font-semibold text-bark">{labelOf(departmentCode)}</p>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-moss">Not on record yet.</p>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ember">Ministry</h3>
                  {ministryCodes.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {ministryCodes.map((code) => (
                        <li key={code} className="text-sm font-semibold text-bark">
                          {labelOf(code)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-moss">No ministry on record yet.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Asking for a ministry is the same ask the Ministry map and the
              rail make — one modal, its picker filtered to the ministries
              they are not already part of. */}
          <AreaJoinModal
            open={joinMinistryOpen}
            area="Ministries"
            exclude={joinExclude}
            onClose={() => setJoinMinistryOpen(false)}
          />

          <form onSubmit={saveContact} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Contact details</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              The number the church reaches you on, and the one M-Pesa prompts when you give, plus the
              address your giving receipts are sent to. A member in our system receives their letters on
              their account address; the phone line is for everything else.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Phone number
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="e.g. 0712345678"
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5"
                />
              </label>
              <label className="block text-sm font-medium">
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5"
                />
              </label>
            </div>
            {pendingEmail && (
              <div className="mt-4 rounded-2xl bg-sand p-4 border border-sand-line flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-semibold text-bark">Verification pending:</span>{" "}
                  <span className="text-moss">{pendingEmail}</span>
                  <p className="mt-0.5 text-xs text-moss">A 6-digit verification code was sent to this address to verify ownership.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyError("");
                      setVerificationCode("");
                      setShowEmailVerifyModal(true);
                    }}
                    className="rounded-full bg-sage px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                  >
                    Enter code
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelEmailChange()}
                    className="rounded-full border border-sand-line px-4 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
                  >
                    Cancel change
                  </button>
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button disabled={phoneSaving} className="rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {phoneSaving ? "Saving..." : "Save contact details"}
              </button>
            </div>
            {phoneMessage && <p className="mt-3 text-right text-sm text-moss">{phoneMessage}</p>}
          </form>

          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Family members</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              The people your family is made of, a spouse, parent, sibling or child, and the close
              friends among them. Set them once here and the giving form reads them, so no gift asks you
              the same question again. Anything not listed is recorded as Other.
            </p>

            {relationships.length > 0 ? (
              <ul className="mt-5 space-y-3">
                {relationships.map((row, index) => (
                  <li key={`${row.person_id ?? "name"}-${row.name}-${index}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-sand px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {row.name}
                      {!row.person_id && <span className="ml-2 text-xs font-normal text-moss">not on the roll</span>}
                    </span>
                    <select
                      value={row.relationship}
                      onChange={(event) => {
                        const next = [...relationships];
                        next[index] = { ...row, relationship: event.target.value };
                        setRelationships(next);
                        setRelMessage("");
                      }}
                      className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                    >
                      {RELATIONSHIP_CHOICES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setRelationships(relationships.filter((_, i) => i !== index));
                        setRelMessage("");
                      }}
                      aria-label={`Remove ${row.name}`}
                      className="rounded-lg p-1.5 text-moss transition hover:text-ember"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-2xl bg-sand px-4 py-3 text-sm text-moss">No relationships yet. Add the first below.</p>
            )}

            <div className="mt-5 rounded-2xl border border-sand-line p-4">
              <p className="mb-2 text-sm font-medium">Add a person</p>
              <div className="relative">
                <input
                  type="text"
                  value={pickedForAdd ? pickedForAdd.name : relQuery}
                  onChange={(event) => searchPersonToAdd(event.target.value)}
                  placeholder="Type a name from the church roll…"
                  className="w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
                {!pickedForAdd && relMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-y-auto rounded-2xl border border-sand-line bg-white p-2 shadow-xl">
                    {relMatches.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          setPickedForAdd(person);
                          setRelQuery(person.name);
                          setRelMatches([]);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-moss-dark transition hover:bg-sand hover:text-bark"
                      >
                        <span className="min-w-0 truncate">{person.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={newRelationship}
                  onChange={(event) => setNewRelationship(event.target.value)}
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2.5 text-sm outline-none focus:border-ember"
                >
                  <option value="">How do they relate?</option>
                  {RELATIONSHIP_CHOICES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addRelationship}
                  className="rounded-full bg-bark px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember"
                >
                  Add
                </button>
                {!pickedForAdd && relQuery.trim().length >= 2 && relMatches.length === 0 && (
                  <span className="text-xs text-moss">No match. Add writes the name as typed.</span>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={relSaving}
                onClick={saveRelationships}
                className="rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {relSaving ? "Saving..." : "Save relationships"}
              </button>
            </div>
            {relMessage && <p className="mt-3 text-right text-sm text-moss">{relMessage}</p>}
          </section>

          {details && (
            <form onSubmit={saveDetails} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
              <h2 className="text-xl font-semibold">Additional church details</h2>
              <p className="mt-2 text-sm leading-6 text-moss">
                Complete these details when convenient. A church official may also update them, and your national ID will be collected and verified by an official later.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Date of birth
                  <input type="date" value={details.date_of_birth || ""} onChange={(event) => setDetails({ ...details, date_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  County of birth
                  <select value={details.county_of_birth || ""} onChange={(event) => setDetails({ ...details, county_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5">
                    <option value="">Select county</option>
                    {kenyaCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Level of education
                  <input value={details.education_level || ""} onChange={(event) => setDetails({ ...details, education_level: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  Profession
                  <input value={details.profession || ""} onChange={(event) => setDetails({ ...details, profession: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  Residence
                  <input value={details.residence || ""} placeholder="Estate, street or town" onChange={(event) => setDetails({ ...details, residence: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                {details.current_church !== undefined && (
                  <label className="block text-sm font-medium sm:col-span-2">
                    Current church
                    <input value={details.current_church || ""} onChange={(event) => setDetails({ ...details, current_church: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                  </label>
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <button disabled={savingDetails} className="rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {savingDetails ? "Saving..." : "Save details"}
                </button>
              </div>
              {detailsMessage && <p className="mt-3 text-right text-sm text-moss">{detailsMessage}</p>}
            </form>
          )}

          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Appearance</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              How the app is lit. <strong>System</strong> follows your device and keeps following it
              as the device switches between light and dark; Light and Dark hold the app still
              whatever the device does. Resetting the display defaults returns you to System.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
              {(["system", "light", "dark"] as ThemeChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setTheme(choice)}
                  aria-pressed={theme === choice}
                  className={`rounded-xl py-2 text-sm font-semibold capitalize transition ${
                    theme === choice
                      ? "bg-bark text-white shadow-sm"
                      : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </section>

          {announcePrefs && (
            <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
              <h2 className="text-xl font-semibold">Notification preferences</h2>
              <p className="mt-2 text-sm leading-6 text-moss">
                Choose how announcements reach you. Requests waiting for the office always notify, whatever you switch off here.
              </p>
              <div className="mt-5 space-y-3">
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand px-4 py-3 text-sm font-medium cursor-pointer">
                  <span>
                    Announcements by email
                    <span className="block text-xs font-normal text-moss">The broadcast letters, not receipts. Those always come.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={announcePrefs.email}
                    onChange={(e) => saveAnnouncePref("email", e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-sage"
                  />
                </label>
                {pushSupport?.supported ? (
                  <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand px-4 py-3 text-sm font-medium cursor-pointer">
                    <span>
                      Announcements as notifications
                      <span className="block text-xs font-normal text-moss">A notification on this device when an announcement is posted.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={announcePrefs.push}
                      onChange={(e) => saveAnnouncePref("push", e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-sage"
                    />
                  </label>
                ) : (
                  <div className="rounded-2xl bg-sand px-4 py-3 text-sm font-medium">
                    Announcements as notifications
                    <span className="mt-0.5 block text-xs font-normal text-moss">
                      Not available in this browser. On iPhone, add the app to your Home Screen first.
                    </span>
                  </div>
                )}
              </div>
              {pushSupport?.supported && !pushSupport.enabled && announcePrefs.push && (
                <p className="mt-3 text-xs text-moss">
                  To receive them on <em>this</em> device, also tap <strong>Turn on notifications</strong> in the bell at the top of the page. That grants the browser permission.
                </p>
              )}
              {prefMessage && <p className="mt-3 text-sm text-moss">{prefMessage}</p>}
            </section>
          )}
        </div>
      </div>

      {/* Remove Profile Picture Confirmation Modal */}
      {showRemovePhotoPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-photo-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !photoSaving) {
              setShowRemovePhotoPrompt(false);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <h3 id="remove-photo-dialog-title" className="text-xl font-bold text-bark">
                Remove profile picture?
              </h3>
              <p className="mt-2 text-sm text-moss leading-relaxed">
                Are you sure you want to remove your profile picture? Your profile and the navigation bar will revert to displaying your initial.
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line bg-sand-linen/40 px-6 py-4">
              <button
                type="button"
                disabled={photoSaving}
                onClick={() => setShowRemovePhotoPrompt(false)}
                className="rounded-full border border-sand-line px-5 py-2.5 text-sm font-semibold text-moss transition hover:bg-sand disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={photoSaving}
                onClick={async () => {
                  await removePhoto();
                  setShowRemovePhotoPrompt(false);
                }}
                className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {photoSaving ? "Removing..." : "Remove picture"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Verification Modal */}
      {showEmailVerifyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-verify-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !verifyingCode) {
              setShowEmailVerifyModal(false);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <form onSubmit={(e) => void verifyEmailChange(e)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <h3 id="email-verify-dialog-title" className="text-xl font-bold text-bark">
                    Verify new email address
                  </h3>
                  <p className="mt-2 text-sm text-moss leading-relaxed">
                    We sent a 6-digit verification code to <strong className="text-bark">{pendingEmail}</strong>. Enter the code below to confirm changing your account email.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, "");
                      setVerificationCode(clean);
                      setVerifyError("");
                    }}
                    placeholder="000000"
                    className="mt-1.5 block w-full rounded-2xl border border-sand-mute px-4 py-3 text-center text-2xl font-mono tracking-widest outline-none focus:border-ember"
                  />
                </div>

                {verifyError && (
                  <p className="rounded-xl bg-ember/10 p-2.5 text-xs font-medium text-ember">
                    {verifyError}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    disabled={requestingCode}
                    onClick={() => void resendEmailCode()}
                    className="font-medium text-sage hover:underline disabled:opacity-60"
                  >
                    {requestingCode ? "Resending..." : "Didn't receive code? Resend"}
                  </button>
                </div>
              </div>

              {/* Fixed bottom button panel */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line bg-sand-linen/40 px-6 py-4">
                <button
                  type="button"
                  disabled={verifyingCode}
                  onClick={() => setShowEmailVerifyModal(false)}
                  className="rounded-full border border-sand-line px-5 py-2.5 text-sm font-semibold text-moss transition hover:bg-sand disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingCode || verificationCode.trim().length !== 6}
                  className="rounded-full bg-sage px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {verifyingCode ? "Verifying..." : "Verify & update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
