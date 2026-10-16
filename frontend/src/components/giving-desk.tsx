"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Landmark, Search, Smartphone, UserRound, X } from "lucide-react";
import { localDate } from "@/lib/dates";
import { useRouter, useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { thankYouPath } from "@/lib/giving-thanks";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { stewardshipLinks } from "@/config/site-sections";
import { PENDING_GIVINGS_KEY } from "@/components/my-givings";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const defaultPurposes = [
  "Tithe",
  "Combined Offering",
  "13th Sabbath",
  "Camp Expenses",
  "Camp Goal",
  "Local Church Budget",
];

type MethodOfGiving = "mpesa" | "bank_transfer";

/** Who the one form is for: the giver themselves (the default), another
    member the gift is written on, or a member being asked to give. */
type RecipientMode = "myself" | "for_someone" | "request";

/** How a person a gift is for (or asked to give) relates to the one giving
    or asking. The church's short list — anything rarer is Other. These are
    declared once, in the member's profile; the form only reads them. */
const relationships = [
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "child", label: "Child" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

/** One row of the relationships declared in the member's profile. */
type DeclaredRelationship = { person_id?: number | null; name: string; relationship: string };

/** One person from the roll: an account id when the picker found them, and
    always the name the gift should read. */
type PickedPerson = { id?: number; name: string };

/** The person field both new modals share: search the roll while a session
    lasts, fall back to the name typed alone for a visitor. */
function PersonField({
  signedIn, query, matches, picked, onQuery, onPick,
}: {
  signedIn: boolean;
  query: string;
  matches: { id: number; name: string }[];
  picked: PickedPerson | null;
  onQuery: (value: string) => void;
  onPick: (person: PickedPerson) => void;
}) {
  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ember/40 bg-mist-select px-4 py-3 text-sm">
        <UserRound size={16} className="shrink-0 text-ember" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold text-bark">{picked.name}</span>
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label="Choose someone else"
          className="shrink-0 rounded-lg p-1 text-moss transition hover:text-ember"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-moss" aria-hidden="true" />
      <input
        type="text"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={signedIn ? "Type a name from the roll…" : "Their name, as the gift should read…"}
        className="w-full rounded-xl border border-sand-mute py-3 pl-10 pr-4 text-sm outline-none focus:border-ember"
      />
      {matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-52 overflow-y-auto rounded-2xl border border-sand-line bg-white p-2 shadow-xl">
          {matches.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onPick(person)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-moss-dark transition hover:bg-sand hover:text-bark"
            >
              <UserRound size={14} className="shrink-0 text-moss" aria-hidden="true" />
              <span className="min-w-0 truncate">{person.name}</span>
            </button>
          ))}
        </div>
      )}
      {!signedIn && (
        <p className="mt-1.5 text-[11px] text-moss">
          Sign in to search the roll by name. A member in our system receives their letter by email.
        </p>
      )}
    </div>
  );
}

/** One row from /giving-accounts/: the label givers read and the short account name M-Pesa shows. */
type GivingAccountOption = {
  id: number;
  name: string;
  label: string;
  account: string;
  account_type: string;
  account_type_display: string;
};

/** Safaricom's prefixes on the Communications Authority number plan — the
 * only lines an M-Pesa push can reach, so the account phone pre-fills the
 * field only when it belongs to one. */
const SAFARICOM_PREFIXES = ["070", "071", "072", "074", "079"];

/** The member's stored phone as this field wants it (07XXXXXXXX), or "".
 *
 * Profiles carry the number in whatever shape it was collected (07…, 2547…,
 * +2547…), and an Airtel/Telkom/Equitel line cannot receive an M-Pesa prompt
 * — pre-filling one would only produce a failed push, so it stays empty.
 */
function safaricomPhoneOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("254") ? `0${digits.slice(3)}`
    : digits.length === 10 && digits.startsWith("0") ? digits
    : digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1")) ? `0${digits}`
    : "";
  return local && SAFARICOM_PREFIXES.some((prefix) => local.startsWith(prefix)) ? local : "";
}

/**
 * The one giving form, as the two pages that host it read it.
 *
 * `member` is the desk behind the app's Giving rail row and the phone's
 * Stewardship tab (/member/giving): pinned at every width, roll search on,
 * the receipt addressed from the member's account. `visitor` is the public
 * Support Us page (/give): the marketing site's own flow, which a signed-in
 * reader may also read without the desk's chrome following them there. The
 * split is the point — the two sides no longer share one URL and change
 * shape under the reader.
 */
export function GivingDesk({ mode }: { mode: "member" | "visitor" }) {
  const memberDesk = mode === "member";
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPurposeParam = searchParams.get("purpose");
  const linkedPurpose = (rawPurposeParam ?? "").trim();
  // No default: the giver must pick a purpose ("-- select --" placeholder). A
  // ministry-style name falls through the ministry mapping below; an exact
  // account name is kept as it is, so a link to "Local Church Budget" cannot
  // be turned into the differently-named "Budget".
  const normalizedPurpose = linkedPurpose ? getMinistryGivingPurpose(linkedPurpose) : "";

  // The landing page's In-kind action hands the goods form straight over:
  // ?give=in-kind opens it, the way ?purpose= names the account the money
  // form starts on. This page is public, which the member-side in-kind desk
  // is not — so a visitor's giving never meets the sign-in wall.
  const inKindRequested = (searchParams.get("give") ?? "").trim().toLowerCase() === "in-kind";

  // A giver may support several accounts in one payment, so the choice is a list
  // and each chosen account carries its own amount. One M-Pesa prompt is sent,
  // for the total; the church records the split per account.
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(normalizedPurpose ? [normalizedPurpose] : []);
  const [accountAmounts, setAccountAmounts] = useState<Record<string, string>>({});
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const accountPickerRef = useRef<HTMLDivElement | null>(null);
  const [methodOfGiving, setMethodOfGiving] = useState<MethodOfGiving>("mpesa");
  const [purposes, setPurposes] = useState<GivingAccountOption[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankRefNumber, setBankRefNumber] = useState("");
  const [senderBankName, setSenderBankName] = useState("");
  const [transferDate, setTransferDate] = useState(() => localDate());
  // Receipts are addressed from the signed-in member's account, and an
  // anonymous giver's receipt rides the phone they give with, so the form
  // asks for neither name nor email — except when a signed-in account has no
  // email at all. That is the one thing the member alone can fix (the only
  // way an email receipt can ever reach them), so it keeps a small field.
  const [donorEmail, setDonorEmail] = useState("");
  // The address currently on the member's account.
  const [accountEmail, setAccountEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // A tickable switch that keeps the gift from the giver: when ticked, the
  // request says it is not about this person, and the ledger records the gift
  // against the phone it was paid from alone — never their name or email.
  // The toggle is off the form for now (commented out below), so this stays
  // false; the setter returns with the toggle.
  const [anonymous] = useState(false);

  // Giving form modal (opened via Give Now or a ?purpose= deep link)
  const [showGiveModal, setShowGiveModal] = useState(false);
  // The in-kind form is the same modal the announcements and the in-kind
  // page open — one form, so a gift is filed identically wherever it is
  // given. The Giving page carries its button beside Give Money, so the
  // shelf of ways to give needs no page of its own.
  const [showInKindModal, setShowInKindModal] = useState(inKindRequested);

  // ── Giving for someone, and asking someone to give ─────────────────────
  // All three ways of giving live in this one modal, picked from a combo at
  // its top: the giver's own gift, a gift written on another member's
  // record, and an ask sent to another member. The person and how they
  // relate are gathered inline whenever the mode needs them.
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("myself");
  const [honoreePhone, setHonoreePhone] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [personMatches, setPersonMatches] = useState<{ id: number; name: string }[]>([]);
  const [pickedPerson, setPickedPerson] = useState<PickedPerson | null>(null);
  // How the signed-in giver relates to the people they give for or ask to
  // give — declared once in their profile, read here, never picked again.
  const [declaredRelationships, setDeclaredRelationships] = useState<DeclaredRelationship[]>([]);
  // A request arrived by its own link: this gift, if made through it, closes
  // that request. Fetched from the id in the address bar.
  const [askingRequest, setAskingRequest] = useState<{ id: number; requesterName: string; message: string } | null>(null);

  /** Debounced roll search. The timer lives in a ref and the fetching is
      done here rather than in an effect: a keystroke schedules the search,
      the previous one is cancelled, and nothing sets state while rendering
      settles. A visitor has no session to search with, so their typing only
      ever fills the name. */
  const searchTimer = useRef<number | null>(null);
  const searchPerson = (raw: string) => {
    setPersonQuery(raw);
    setPickedPerson(null);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const query = raw.trim();
    if (query.length < 2 || !memberDesk) {
      setPersonMatches([]);
      return;
    }
    const token = localStorage.getItem("access_token");
    if (!token) {
      setPersonMatches([]);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : { matches: [] }))
        .then((data) => setPersonMatches(Array.isArray(data.matches) ? data.matches : []))
        .catch(() => setPersonMatches([]));
    }, 250);
  };

  const pickPerson = (person: PickedPerson) => {
    setPickedPerson(person);
    setPersonQuery(person.name);
    setPersonMatches([]);
  };

  const resetPersonField = () => {
    setPickedPerson(null);
    setPersonQuery("");
    setPersonMatches([]);
  };

  /** The relationship declared in the profile for the person picked: by
      account id when the roll found them, by name for one typed alone. An
      empty string means none is on record — the server then records Other. */
  const declaredLabelFor = (person: PickedPerson | null) => {
    if (!person) return "";
    const wantedId = person.id;
    const wantedName = person.name.trim().toLowerCase();
    const row = declaredRelationships.find((entry) =>
      wantedId && entry.person_id
        ? entry.person_id === wantedId
        : (!wantedId || !entry.person_id) && (entry.name || "").trim().toLowerCase() === wantedName
    );
    return row ? relationships.find((option) => option.value === row.relationship)?.label || "" : "";
  };

  /** Switching who the one form is for: the person is gathered afresh, and
      the prompt phone belongs to whoever pays — the payer's own number
      returns the moment the form is not asking someone else to pay, and
      never leaks into an ask, where the number asked is typed anew. */
  const changeRecipientMode = (mode: RecipientMode) => {
    setRecipientMode(mode);
    resetPersonField();
    setHonoreePhone("");
    // A request is always settled by M-Pesa prompt, so its mode starts
    // there; the payer's own number returns the moment it is a gift again.
    if (mode === "request") setMethodOfGiving("mpesa");
    setPhoneNumber(mode === "request" ? "" : payerPhoneRef.current);
  };

  // A request's own link opens the giving form with the ask waiting on it:
  // the recipient reads who asked before deciding anything.
  const rawRequestParam = searchParams.get("request");
  useEffect(() => {
    if (!rawRequestParam) return;
    // The notifications carry the old /give link, so the public page walks a
    // reader to the desk rather than showing a form whose person picker it
    // cannot offer there.
    if (!memberDesk) {
      router.replace(`/member/giving?request=${rawRequestParam}`);
      return;
    }
    fetch(`${API_URL}/api/members/giving-requests/${rawRequestParam}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.status === "pending") {
          setAskingRequest({ id: data.id, requesterName: data.requester_name, message: data.message || "" });
          // What was asked for rides the link: the form opens with the
          // purpose chosen and the amount already entered, so the recipient
          // only has to confirm the phone and continue.
          if (data.purpose) {
            setSelectedAccounts([data.purpose]);
            const askedAmount = Number(data.amount);
            setAccountAmounts(
              Number.isFinite(askedAmount) && askedAmount >= 1
                ? { [data.purpose]: String(askedAmount) }
                : {}
            );
          }
          setShowGiveModal(true);
        }
      })
      .catch(() => {});
  }, [rawRequestParam]);

  // ── Who is giving ────────────────────────────────────────────────────────────
  // The member's record lives on its own route (/member/givings, linked from
  // the account menu). Which of the two pages this is decides the toast, the
  // redirect and the link to that record.

  // The payer's own prompt phone, kept aside: returning to a plain give
  // after a request restores it, never the asked person's number.
  const payerPhoneRef = useRef("");

  // A desk giver's receipt is addressed from their account, so the form only
  // needs to know whether that account carries an email — it shows the
  // add-an-email field when it does not. The visitor page asks nothing.
  useEffect(() => {
    if (!memberDesk) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!me) return;
        setAccountEmail(me.email || "");
        // How this member relates to the people they give for or ask to
        // give — declared in their profile, shown read-only below the person.
        setDeclaredRelationships(Array.isArray(me.declared_relationships) ? me.declared_relationships : []);
        // The phone the M-Pesa prompt goes to: pre-filled from the account
        // when it is a Safaricom number, left empty otherwise.
        payerPhoneRef.current = safaricomPhoneOf(me.phone_number || "");
        setPhoneNumber((current) => (current ? current : payerPhoneRef.current));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (rawPurposeParam) {
      const mapped = getMinistryGivingPurpose(rawPurposeParam);
      setSelectedAccounts([mapped]);
      setShowGiveModal(true);
    }
  }, [rawPurposeParam]);

  /**
   * The account list behaves like a dropdown: tapping anywhere outside it — the
   * rest of the form, the amount rows it opens over, the backdrop — closes it,
   * and so does Escape. The trigger is inside the ref, so its own tap still
   * toggles rather than closing and instantly reopening.
   */
  useEffect(() => {
    if (!showAccountPicker) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!accountPickerRef.current?.contains(event.target as Node)) setShowAccountPicker(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccountPicker(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showAccountPicker]);

  // Opening the form never wears the previous attempt's message: a success is
  // announced by its toast alone, and a stale error is not the new form's news.
  useEffect(() => {
    if (showGiveModal) setMessage("");
  }, [showGiveModal]);

  // One modal, three flows: the giver's own gift, a gift for someone, and
  // a request sent to someone — the last one submitted to the request
  // endpoint instead of the giving one.
  const isRequestMode = recipientMode === "request";

  const toggleAccount = (account: string) => {
    setSelectedAccounts((current) => {
      if (isRequestMode) {
        // A request asks for one gift in one account: picking another
        // replaces the choice instead of adding a second row.
        return current.includes(account) ? current.filter((item) => item !== account) : [account];
      }
      return current.includes(account) ? current.filter((item) => item !== account) : [...current, account];
    });
  };

  /**
   * Phones: lift the focused field clear of the software keyboard.
   *
   * The keyboard overlays the page rather than resizing it on a phone, so a
   * field near the foot of the modal ends up underneath it — you type blind.
   * The browser's own scroll happens while the keyboard is still animating, so
   * this waits for it to settle and then centres the field in the modal.
   */
  function liftAboveKeyboard(event: React.FocusEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    if (window.innerWidth >= 640) return;
    window.setTimeout(() => {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
  }

  const allocationTotal = selectedAccounts.reduce(
    (sum, account) => sum + (Number(accountAmounts[account]) || 0),
    0
  );

  const accountPickerLabel =
    selectedAccounts.length === 0
      ? "-- select --"
      : selectedAccounts.length === 1
        ? selectedAccounts[0]
        : `${selectedAccounts[0]} +${selectedAccounts.length - 1} more`;

  const [churchBankDetails, setChurchBankDetails] = useState({
    bank_name: "KCB Bank Kenya",
    bank_account_name: "SDA Church Main Account",
    bank_account_number: "1122334455",
    bank_branch: "Meru",
    bank_swift_code: "KCBKNEN",
    // Blank by default: the church hides its manual M-Pesa details by leaving
    // the paybill unset, and the card below disappears with it.
    mpesa_paybill_number: "",
  });

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setChurchBankDetails({
            bank_name: data.bank_name || "KCB Bank Kenya",
            bank_account_name: data.bank_account_name || "SDA Church Main Account",
            bank_account_number: data.bank_account_number || "1122334455",
            bank_branch: data.bank_branch || "Nairobi West",
            bank_swift_code: data.bank_swift_code || "KCBKNEN",
            mpesa_paybill_number: data.mpesa_paybill_number || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  /**
   * The published list, plus the account this visit was linked to.
   *
   * A support link (?purpose=) can name an account that is not in the published
   * list — a ministry account, say. Without this the picker would fall back to
   * its first option and the giver would support the wrong account entirely.
   */
  const ensureLinkedPurpose = (list: GivingAccountOption[], wanted: string) =>
    wanted && !list.some((option) => option.label.toLowerCase() === wanted.toLowerCase())
      ? [{ id: -1, name: wanted.slice(0, 12), label: wanted, account: wanted.slice(0, 12), account_type: "other", account_type_display: "Other" }, ...list]
      : list;

  useEffect(() => {
    // Treasury accounts are the one source of giving accounts, priority-ordered
    // by the API (Tithe, offerings, budget, camp funds, then the rest).
    fetch(`${API_URL}/api/members/giving-accounts/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: GivingAccountOption[]) => {
        const published = data.length ? data : defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" }));
        const exact = linkedPurpose
          ? published.find((option) => option.label.toLowerCase() === linkedPurpose.toLowerCase())
          : undefined;
        if (exact) setSelectedAccounts([exact.label]);
        setPurposes(ensureLinkedPurpose(published, exact?.label ?? normalizedPurpose));
      })
      .catch(() => setPurposes(ensureLinkedPurpose(
        defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" })),
        normalizedPurpose,
      )));
  }, [linkedPurpose, normalizedPurpose]);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    // One stamp for both methods: the record page polls quietly for the new
    // row until this window lapses (the PIN lands a minute or two later).
    const watchUntil = String(Date.now() + 5 * 60 * 1000);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    try {
      if (selectedAccounts.length === 0) {
        showAlert("Choose an account", "Select at least one account to give to.", "warning");
        setLoading(false);
        return;
      }
      const withoutAmount = selectedAccounts.find((account) => (Number(accountAmounts[account]) || 0) < 1);
      if (withoutAmount) {
        showAlert("Amount needed", `Enter an amount of at least KES 1 for ${withoutAmount}.`, "warning");
        setLoading(false);
        return;
      }
      // The ledger records the wording givers read (the description); the
      // M-Pesa prompt shows the account, which Safaricom caps at 12 characters.
      const accountByName = new Map(purposes.map((option) => [option.label, option.account]));
      const allocations = selectedAccounts.map((account) => ({
        purpose: account,
        account: accountByName.get(account) || account.slice(0, 12),
        amount: Number(accountAmounts[account]) || 0,
      }));

      if (methodOfGiving === "mpesa" && (phoneNumber || !isRequestMode)) {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        if (cleanPhone.length !== 10) {
          showAlert("Invalid Phone Number", "Please enter a valid 10-digit phone number.", "warning");
          setLoading(false);
          return;
        }
      }

      // A gift given FOR someone: the person gathered in the form above.
      // A visitor's typed name still writes the gift in that person's name;
      // a member's pick also lands it on their record.
      const forSomeone = recipientMode === "for_someone";
      const honoreeName = forSomeone ? (pickedPerson?.name || personQuery).trim() : "";
      if (forSomeone && !honoreeName) {
        showAlert("Name needed", "Type the name of the person this gift is for.", "warning");
        setLoading(false);
        return;
      }

      // A request is sent rather than a gift: the form's purpose, amount and
      // phone become the ask, and the server prompts that phone for exactly
      // this gift — the person asked gives by entering their PIN, or not at
      // all. The email and the link stay as the way to give without one.
      if (isRequestMode) {
        const askedName = (pickedPerson?.name || personQuery).trim();
        const targetId = pickedPerson?.id;
        if (!targetId || !askedName) {
          showAlert("Choose the person", "Pick the one you are asking from the list as you type their name.", "warning");
          setLoading(false);
          return;
        }
        if (!token) {
          setLoading(false);
          showAlert("Sign in first", "Only a member can ask another member to give, and the request carries your name.", "warning");
          return;
        }
        const response = await fetch(`${API_URL}/api/members/giving-requests/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            target_id: targetId,
            giver_phone: phoneNumber,
            purpose: allocations[0].purpose,
            amount: allocationTotal,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || Object.values(data).flat().join(" ") || "The request could not be sent.");
        }
        setShowGiveModal(false);
        setLoading(false);
        setRecipientMode("myself");
        resetPersonField();
        showAlert(
          "Request sent",
          data.detail || "Your request has been sent.",
          data.prompt_sent ? "success" : "warning"
        );
        return;
      }

      // The receipt is addressed from the account (the API ignores any address
      // sent in the payload). The one edit this form makes is adding an email
      // to an account that has none — the field only exists for that case — so
      // it is saved before the gift is initiated and the callback's ledger row
      // and receipt already carry it. It never clears an existing address.
      const typedEmail = donorEmail.trim();
      if (memberDesk && !anonymous && token && !accountEmail.trim() && typedEmail) {
        const saveResponse = await fetch(`${API_URL}/api/members/me/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: typedEmail }),
        });
        if (!saveResponse.ok) {
          const problem = await saveResponse.json().catch(() => ({}));
          throw new Error(
            problem.email?.[0] || problem.detail || "That email address could not be saved to your account."
          );
        }
        const saved = await saveResponse.json().catch(() => null);
        setAccountEmail(saved?.email ?? typedEmail);
      }

      let descriptionPayload = "";
      if (methodOfGiving === "bank_transfer") {
        const details = [
          bankRefNumber ? `Ref: ${bankRefNumber}` : "",
          senderBankName ? `From: ${senderBankName}` : "",
          transferDate ? `Date: ${transferDate}` : "",
        ].filter(Boolean).join(" | ");
        descriptionPayload = details || "Bank Transfer";
      }

      const payload: Record<string, unknown> = {
        giving_type: "financial",
        payment_method: methodOfGiving,
        // The whole gift, split per account. The API totals it for the prompt.
        allocations,
        amount: allocationTotal,
        purpose: allocations[0].purpose,
        phone_number: phoneNumber,
        item_description: descriptionPayload,
        // The stamp that keeps this gift off the giver's own record: the
        // backend drops the name and email when it sees it.
        ...(anonymous ? { anonymous: true } : {}),
        // A gift given FOR someone: the account the picker found (or the
        // name alone for a visitor). The relationship comes from the giver's
        // profile, read on the server — the form never asks for it. The
        // person in our system receives their letter by email. The phone
        // travels only when the honoree holds no account — a way to follow up.
        ...(forSomeone
          ? {
              ...(pickedPerson?.id ? { honoree_id: pickedPerson.id } : {}),
              honoree_name: honoreeName,
              honoree_phone: honoreePhone,
            }
          : {}),
        // A gift made through a request's own link closes that request.
        ...(askingRequest ? { giving_request_id: askingRequest.id } : {}),
      };
      // Neither name nor email rides the payload: a signed-in gift is recorded
      // against the member's account, and an anonymous one against the phone
      // it was paid from — the ledger greets it "Dear friend" and the receipt
      // goes by SMS. The API derives both from the request itself.

      const response = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || Object.values(data).flat().join(" ") || "We could not start the giving request.");
      }

      if (methodOfGiving === "mpesa") {
        setShowGiveModal(false);
        setLoading(false);
        if (memberDesk) {
          const promptMessage = data.message ?? "M-Pesa prompt sent. Enter your PIN on your phone to complete the payment.";
          // The toast carries it; printing the same sentence into the form as
          // well left it waiting at the top of the next visit to the modal.
          showAlert("M-Pesa prompt sent", promptMessage, "info", {
            toast: true,
            position: "top-end",
            timer: 7000,
            showConfirmButton: false,
          });
          // The PIN usually lands within a minute or two: stamp the moment so
          // My Givings polls quietly for the new row when it is opened.
          localStorage.setItem(PENDING_GIVINGS_KEY, watchUntil);
        } else {
          // A visitor has no record to poll; they land on the public
          // confirmation page, which carries the drive context home.
          router.push(thankYouPath({ kind: "money", method: "mpesa", title: allocations[0]?.purpose }));
        }
      } else {
        setShowGiveModal(false);
        setLoading(false);
        if (memberDesk) {
          const successMsg = data.message ?? "Thank you! Your Bank Transfer contribution details have been recorded.";
          showAlert("Contribution Received", successMsg, "success");
          localStorage.setItem(PENDING_GIVINGS_KEY, watchUntil);
        } else {
          router.push(thankYouPath({ kind: "money", method: "bank", title: allocations[0]?.purpose }));
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the giving service.";
      setMessage(errorMsg);
      showAlert("Giving Error", errorMsg, "error");
      setLoading(false);
    }
  }

  let submitButtonText = isRequestMode ? "Send the request" : "Submit Bank-to-Bank Giving";
  if (loading) submitButtonText = isRequestMode ? "Sending…" : "Submitting...";
  else if (!isRequestMode && methodOfGiving === "mpesa") submitButtonText = "Continue with M-Pesa";

  return (
    <main className={memberDesk ? "flex h-full min-h-0 flex-col overflow-hidden bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* The desk pins at every width (scrollModeForPath): the document never
          scrolls, so the page carries its own scroller — the paybill band, the
          button block and the bank band move as one, whatever the viewport.
          The visitor page keeps the marketing site's own scrolling. */}
      <div className={memberDesk ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-8 pt-4 sm:px-8 sm:pt-5 lg:px-10" : "mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12"}>
          <div className="space-y-6">
            {/* The strip names the page on the desk; the public page keeps the title. */}
            <h1 className={memberDesk ? "sr-only" : "mt-3 hidden shrink-0 text-3xl font-semibold tracking-tight sm:text-4xl md:block"}>
              Giving
            </h1>

            {/* ── Paying the church directly: Safaricom's paybill ──
                The paybill stands on its own band above the two giving
                buttons — a giver pushing the money themselves reads where to
                send it before the form's own doors — and the band it takes
                above them is half of what sits the button block in the middle
                of the page, the bank account holding the other half under it.
                It disappears while the church has not set a paybill. */}
            {churchBankDetails.mpesa_paybill_number && (
              <article className="rounded-3xl border border-sand-line bg-white p-5 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-bold text-bark">
                  <Smartphone size={14} aria-hidden="true" /> Pay with Safaricom M-Pesa
                </p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-moss">Pay Bill number</dt>
                    <dd className="font-mono text-base font-bold text-bark">{churchBankDetails.mpesa_paybill_number}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-moss">Account number</dt>
                    <dd className="text-right font-semibold text-bark">
                      The account you are giving for, e.g. TITHE or Combined Offering
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-sand-line pt-3 text-[11px] text-moss">
                  M-Pesa → Lipa na M-Pesa → Pay Bill, then enter the account above.
                </p>
              </article>
            )}

            {/* ── Give Now: the direct path, in the middle of the page ──
                The line over the two doors names the ways to give and nothing
                else — the form explains itself when it opens. */}
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center sm:py-8">
              <p className="max-w-md text-sm text-moss">
                Give in Kind, Give by M-Pesa or record bank transfer.
              </p>
              {/* The two ways to give itself: goods, services and time,
                  or money. In-kind opens the same modal the announcements
                  and drives open; money opens the giving form. They sit on
                  one row in a hand too — the pills give up their desk-sized
                  padding and type on a phone rather than stacking, so both
                  doors are read in the same glance. */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowInKindModal(true)}
                  className="rounded-full border border-ember/50 bg-white px-6 py-3 text-sm font-semibold text-ember transition hover:border-ember hover:bg-ember hover:text-white sm:px-10 sm:py-4 sm:text-base"
                >
                  Give in Kind
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Give Money is the giver's own gift: the form opens with
                    // the details shown and the payer's own prompt phone.
                    resetPersonField();
                    setHonoreePhone("");
                    setRecipientMode("myself");
                    setPhoneNumber(payerPhoneRef.current);
                    setShowGiveModal(true);
                  }}
                  className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ember-deep sm:px-10 sm:py-4 sm:text-base"
                >
                  Give Money
                </button>
              </div>
              {memberDesk && (
                <Link href="/member/givings" className="text-xs font-semibold text-ember hover:underline">
                  View my givings
                </Link>
              )}
            </div>

            {/* ── Paying the church directly: the bank ──
                The bank account is the band under the buttons — the second of
                the two that hold the button block between them — for a giver
                who would rather push the money themselves. */}
            <article className="rounded-3xl border border-sand-line bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-bold text-bark">
                <Landmark size={14} aria-hidden="true" /> Pay by bank transfer
              </p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-moss">Bank</dt>
                  <dd className="font-semibold text-bark">{churchBankDetails.bank_name}</dd>
                </div>
                <div>
                  <dt className="text-moss">Account name</dt>
                  <dd className="font-semibold text-bark">{churchBankDetails.bank_account_name}</dd>
                </div>
                <div>
                  <dt className="text-moss">Account no</dt>
                  <dd className="font-mono font-semibold text-bark">{churchBankDetails.bank_account_number}</dd>
                </div>
                <div>
                  <dt className="text-moss">Branch / Swift</dt>
                  <dd className="font-semibold text-bark">{churchBankDetails.bank_branch} / {churchBankDetails.bank_swift_code}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-sand-line pt-3 text-[11px] text-moss">
                After transferring, tap Give Now → Bank-to-Bank and enter the reference so the
                gift is recorded against your account.
              </p>
            </article>

          </div>
      </div>

      {/* ── Give in Kind — the same form the announcements and the in-kind
          page open, so a goods gift is filed identically wherever it is
          given ── */}
      <InKindGiftModal open={showInKindModal} onClose={() => setShowInKindModal(false)} />

      {/* ── Give Now modal ── */}
      {showGiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-modal-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 id="give-modal-title" className="text-lg font-bold text-bark">
                  {isRequestMode
                    ? "Request from someone"
                    : recipientMode === "for_someone" ? "Give for someone" : "Give Now"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGiveModal(false)}
                disabled={loading}
                className="text-xl leading-none text-moss hover:text-bark"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {/* ── The two switches that frame every gift ──
                Whose name it carries (the toggle) and who it is for (the
                combo), both at the top: nothing else on the form turns on
                them more. A request carries the asker's name by nature, so
                the toggle stands only where a gift is being given.

                The anonymity toggle is off the form for now — kept here
                commented out in case it returns. Every gift is recorded
                with its giver. */}
            {/* {!isRequestMode && (
              <div
                role="radiogroup"
                aria-label="Whose name the gift carries"
                className="relative mt-4 flex w-full items-center rounded-full border border-sand-mute bg-sand p-1"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1 left-1 w-[calc(50%_-_0.25rem)] rounded-full bg-white shadow-sm ring-1 ring-sand-line transition-transform duration-200 ease-out ${anonymous ? "translate-x-[calc(100%_-_0.5rem)]" : "translate-x-0"}`}
                />
                <button
                  type="button"
                  role="radio"
                  aria-checked={!anonymous}
                  onClick={() => setAnonymous(false)}
                  className={`relative z-10 min-w-0 flex-1 rounded-full px-2 py-2 text-xs font-semibold transition-colors ${anonymous ? "text-moss" : "text-bark"}`}
                >
                  Show my details
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={anonymous}
                  onClick={() => setAnonymous(true)}
                  className={`relative z-10 min-w-0 flex-1 rounded-full px-2 py-2 text-xs font-semibold transition-colors ${anonymous ? "text-bark" : "text-moss"}`}
                >
                  Give anonymously
                </button>
              </div>
            )} */}

            {/* Who the gift is for and how it is paid — the two choices
                that frame the form, sharing one row. */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block self-start text-sm font-medium text-bark">
                Who is this for?
                <select
                  value={recipientMode}
                  onChange={(event) => changeRecipientMode(event.target.value as RecipientMode)}
                  className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm outline-none focus:border-ember"
                >
                  <option value="myself">Give for myself</option>
                  <option value="for_someone">Give for someone</option>
                  <option value="request">Request from someone</option>
                </select>
              </label>
              {/* A request is settled by M-Pesa prompt alone, so the method
                  stands only where a gift is being given. */}
              {!isRequestMode && (
                <label className="block self-start text-sm font-medium text-bark">
                  Method of Giving
                  <select
                    value={methodOfGiving}
                    onChange={(event) => setMethodOfGiving(event.target.value as MethodOfGiving)}
                    className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm outline-none focus:border-ember"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank_transfer">Bank-to-Bank</option>
                  </select>
                </label>
              )}
            </div>

            {/* A gift in another member's name is written on their record
                too, and they receive their letter by email — a spouse's
                tithe counts on the spouse's statement. */}
            {recipientMode === "for_someone" && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-bark">Who is it for?</p>
                  <PersonField
                    signedIn={memberDesk}
                    query={personQuery}
                    matches={personMatches}
                    picked={pickedPerson}
                    onQuery={searchPerson}
                    onPick={pickPerson}
                  />
                </div>
                {/* The relationship lives in the profile, not here: it reads
                    back for the person picked, or says where to set it. */}
                {pickedPerson && (
                  <p className="text-xs text-moss">
                    {declaredLabelFor(pickedPerson) ? (
                      <>Your relationship: <span className="font-semibold text-bark">{declaredLabelFor(pickedPerson)}</span></>
                    ) : (
                      <>Not set yet. Add this person under <Link href="/member" className="font-semibold text-ember">Profile &rarr; Relationships</Link>; until then the gift is recorded as Other.</>
                    )}
                  </p>
                )}
                {/* The phone of the person this is for — only when they hold no
                    account, so the row still carries a way to follow up. */}
                {pickedPerson && !pickedPerson.id && (
                  <label className="block text-sm font-medium text-bark">
                    Phone number <span className="font-normal text-moss">(optional)</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={honoreePhone}
                      onChange={(e) => setHonoreePhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="e.g. 0712345678"
                      className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm outline-none focus:border-ember"
                    />
                  </label>
                )}
              </div>
            )}
            {/* Ask a member to give — the person stands where the money is
                named, so the prompt and the request agree on who is being
                asked. */}
            {isRequestMode && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-moss">
                  Ask a member to give. The account and the amount below set
                  the ask; a request is an invitation, never a debt.
                </p>
                <div>
                  <p className="mb-2 text-sm font-medium text-bark">Who are you asking?</p>
                  <PersonField
                    signedIn={memberDesk}
                    query={personQuery}
                    matches={personMatches}
                    picked={pickedPerson}
                    onQuery={searchPerson}
                    onPick={pickPerson}
                  />
                </div>
                {/* The ask carries the relationship declared in the profile —
                    the server reads it when the request is sent. */}
                {pickedPerson && (
                  <p className="text-xs text-moss">
                    {declaredLabelFor(pickedPerson) ? (
                      <>Your relationship: <span className="font-semibold text-bark">{declaredLabelFor(pickedPerson)}</span></>
                    ) : (
                      <>Not set yet. Add this person under <Link href="/member" className="font-semibold text-ember">Profile &rarr; Relationships</Link>; until then the request is recorded as Other.</>
                    )}
                  </p>
                )}
              </div>
            )}
            {askingRequest && !isRequestMode && (
              <div className="mt-4 rounded-2xl border border-sage-strong/40 bg-sage-strong/10 px-4 py-3 text-sm text-bark">
                <p className="font-semibold">
                  {askingRequest.requesterName} has asked you to give.
                </p>
                {askingRequest.message && (
                  <p className="mt-1 break-words text-xs text-moss">&ldquo;{askingRequest.message}&rdquo;</p>
                )}
                <p className="mt-1 text-[11px] text-moss">
                  A gift through this form closes their request. Nothing here is a debt.
                </p>
              </div>
            )}

            <form
              id="give-form"
              onSubmit={submitGiving}
              className="mt-5 space-y-5"
            >
              {message && (
                <div className="rounded-2xl bg-sand border border-sand-line p-4 text-xs font-semibold text-bark">
                  {message}
                </div>
              )}

              {/* 1. Receipts — addressed from the account, not the form. A
                  signed-in member's receipt carries their account's name and
                  email; an anonymous giver's rides the phone they give with.
                  Only a member whose account has no email sees a field — the
                  one thing they alone can fix. An anonymous gift keeps even
                  that: nothing of theirs is saved. A request keeps none of
                  it: the prompt's recipient is the person asked, whose own
                  receipt rides their phone. */}
              {memberDesk && !anonymous && !accountEmail.trim() && !isRequestMode && (
                <label className="block text-sm font-medium text-bark">
                  Email for receipts <span className="font-normal text-moss">(optional)</span>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(event) => setDonorEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-moss">
                    Saved to your account so a receipt can reach you by email. Leave it out and your receipt goes by SMS to the phone you give with.
                  </span>
                </label>
              )}

              {/* 2. How the money moves: the phone the M-Pesa prompt goes to
                  and which accounts it goes to — the method and who it is for
                  share the row above the form. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {methodOfGiving === "mpesa" && (
                  <label className="block self-start text-sm font-medium text-bark">
                    {isRequestMode ? "Their phone number" : "Phone number"}
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      minLength={10}
                      required={!isRequestMode}
                      placeholder="e.g. 0712345678"
                      value={phoneNumber}
                      onFocus={liftAboveKeyboard}
                      onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                    />
                    {isRequestMode && (
                      <span className="mt-1 block text-[11px] font-normal text-moss">
                        Where the M-Pesa prompt goes. Leave it empty to use the number on their account.
                      </span>
                    )}
                  </label>
                )}

                <div className="block self-start text-sm font-medium text-bark">
                  <span>Giving accounts</span>
                  <div className="relative mt-2" ref={accountPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowAccountPicker((open) => !open)}
                      aria-expanded={showAccountPicker}
                      aria-label="Choose giving accounts"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-mute bg-white px-4 py-3 text-left text-sm outline-none transition hover:border-ember focus:border-ember"
                    >
                      <span className={`min-w-0 truncate ${selectedAccounts.length ? "text-bark" : "text-moss-faint2"}`}>
                        {accountPickerLabel}
                      </span>
                      <ChevronDown size={10} className="shrink-0 text-moss" aria-hidden="true" />
                    </button>

                    {showAccountPicker && (
                      /* Opens upward: the fields that follow (amounts, M-Pesa
                         details, the submit button) sit under this row and the
                         list used to cover them. */
                      <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 flex flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
                        <div className="max-h-56 overflow-y-auto p-2">
                          {purposes.map((item) => {
                            const checked = selectedAccounts.includes(item.label);
                            return (
                              <label
                                key={`${item.id}-${item.label}`}
                                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-sand ${checked ? "bg-mist-select font-semibold text-bark" : "text-moss-dark"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAccount(item.label)}
                                  className="h-4 w-4 shrink-0 rounded border-sand-mute text-sage-strong focus:ring-sage-strong"
                                />
                                <span className="min-w-0 flex-1 truncate pr-1">{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {/* The instruction and the way out sit at the foot of
                            the list, where the eye lands after ticking. */}
                        <div className="flex items-center justify-between gap-2 border-t border-sand-line bg-white px-2.5 py-1.5">
                          {/* The phrase wraps rather than ellipsizing: on a phone
                              the Done button leaves it just short of one line. */}
                        <p className="min-w-0 flex-1 pr-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-ember">
                          {isRequestMode ? "Select the account to request" : "Select the account(s) to give to"}
                        </p>
                          <button
                            type="button"
                            onClick={() => setShowAccountPicker(false)}
                            className="shrink-0 rounded-lg bg-bark px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-bark-900"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. One amount per chosen account — the account and its amount
                  share the row, on phones as well as wide screens. */}
              {selectedAccounts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-bark">Amount per account (KES)</p>
                  {selectedAccounts.map((account) => (
                    <div
                      key={account}
                      className="flex items-center gap-2 rounded-xl border border-sand-line bg-sand/60 px-3 py-2"
                    >
                      {/* One tap takes the account off the gift — placed at
                          the row's left so it never crowds the amount field. */}
                      <button
                        type="button"
                        onClick={() => toggleAccount(account)}
                        aria-label={`Remove ${account}`}
                        title={`Remove ${account}`}
                        className="shrink-0 rounded-full p-1 text-moss-faint2 transition hover:bg-sand-light hover:text-ember-deep"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-bark sm:text-sm">
                        {account}
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        required
                        placeholder="Amount"
                        aria-label={`Amount for ${account}`}
                        value={accountAmounts[account] ?? ""}
                        onChange={(event) =>
                          setAccountAmounts((current) => ({ ...current, [account]: event.target.value }))
                        }
                        className="w-24 shrink-0 rounded-lg border border-sand-mute bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-ember sm:w-32"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-1 pt-1 text-sm">
                    <span className="font-medium text-moss">Total</span>
                    <span className="font-bold text-bark">KES {allocationTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* 4. Method-Specific Details — the giver's own deposit reference,
                  bank and date. The church's account details stay off this form:
                  they are the ones who must read them, and they are already on
                  the page above. */}

              {methodOfGiving === "bank_transfer" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <label className="block text-sm font-medium text-bark">
                      Bank Deposit / Ref Number
                      <input
                        type="text"
                        required
                        placeholder="e.g. DEP-9012 or KCB-8812"
                        value={bankRefNumber}
                        onChange={(event) => setBankRefNumber(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm font-medium text-bark">
                      Your Bank Name
                      <input
                        type="text"
                        placeholder="e.g. Equity Bank, KCB, Absa, Co-op"
                        value={senderBankName}
                        onChange={(event) => setSenderBankName(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>

                    <label className="block text-sm font-medium text-bark">
                      Transfer Date
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(event) => setTransferDate(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>
                  </div>
                </div>
              )}
              {/* Sticky on phones: with several accounts the rows push the button
                  down, so it stays reachable at the foot of the modal instead of
                  scrolling out of sight. */}
              <div className="sticky bottom-0 -mx-6 mt-6 border-t border-sand-line bg-white/95 px-6 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <button
                  disabled={loading}
                  className="w-full rounded-full bg-sage-strong px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-sage-deep2 disabled:opacity-60 sm:text-base"
                >
                  {submitButtonText}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}
