"use client";

/**
 * The one contact modal every desk shares.
 *
 * Two layers live here:
 * - ``ContactModal`` — the shell (overlay, dialog frame, header, action rows,
 *   Close) driven by a plain list of actions, so any desk can offer whatever
 *   contact channels its records carry (the giving ledger adds a receipt
 *   context box and SMS; the roster adds Chat here and WhatsApp).
 * - ``ContactMemberModal`` — the roster's standard four for an app member
 *   (Call, Chat here, WhatsApp, Email), including the "Chat here" flow that
 *   opens a DM and lands the officer in it at /chat?dm=<id>.
 */

import { useId, type ReactNode } from "react";
import { Mail, MessageSquare, Phone, X } from "lucide-react";

import { openConversation } from "@/lib/chat";
import { showAlert } from "@/lib/alerts";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

/** One row in the modal's action list. */
export type ContactAction = {
  /** Stable identity for React's list keys. */
  key: string;
  /** Sized like the roster's icons (14px; the WhatsApp mark stays h-4). */
  icon: ReactNode;
  label: string;
  /** The second line — the number, address, or a hint when it's missing. */
  detail: ReactNode;
  /** Set for link actions (tel:, sms:, mailto:, https://wa.me/…). */
  href?: string;
  /** Extra click handler; closing the modal is the caller's call. */
  onClick?: () => void;
  /** Missing detail? The row greys out with its hint instead of vanishing. */
  disabled?: boolean;
};

type ContactModalProps = {
  /** Called by the X button, the Close button and the backdrop. */
  onClose: () => void;
  /** Dialog heading — "Contact Jane Doe", "Contact Giver", … */
  title: string;
  /** One muted line under the heading — @username, donor name, … */
  subtitle?: string;
  /** Optional block between the header and the actions (receipt context). */
  context?: ReactNode;
  actions: ContactAction[];
};

const ACTION_ROW =
  "flex w-full items-center gap-3 rounded-xl border border-sand-line bg-white px-3.5 py-2.5 text-left text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-sand-line disabled:hover:bg-white";

function ContactActionRow({ action }: { action: ContactAction }) {
  const content = (
    <>
      {action.icon}
      <span className="min-w-0">
        <span className="block">{action.label}</span>
        <span className="block text-[11px] font-normal text-moss">{action.detail}</span>
      </span>
    </>
  );

  // Disabled actions render as buttons — anchors can't be disabled — so a
  // missing number still shows its row and explains itself.
  if (action.disabled) {
    return (
      <button type="button" disabled className={ACTION_ROW}>
        {content}
      </button>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} onClick={action.onClick} className={ACTION_ROW}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={ACTION_ROW}>
      {content}
    </button>
  );
}

export function ContactModal({ onClose, title, subtitle, context, actions }: ContactModalProps) {
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-sand-line sm:px-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-bark">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-moss">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 text-xl leading-none text-moss hover:text-bark"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {context && <div className="mt-4">{context}</div>}

        {/* Each choice is only offered when the detail exists, and the one
            line under it says which number it will use — WhatsApp falls back
            to the phone number, so the officer knows before tapping. */}
        <div className="mt-4 space-y-2">
          {actions.map((action) => (
            <ContactActionRow key={action.key} action={action} />
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sand-mute px-5 py-2 text-xs font-semibold text-moss hover:border-ember"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** The person shape the member modal needs — a slice of ``MemberUser``. */
export type ContactMember = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  whatsapp_number?: string;
};

function memberDisplayName(member: ContactMember): string {
  const full = `${member.first_name || ""} ${member.last_name || ""}`.trim();
  return full || member.username || "member";
}

/** Kenyan phone numbers on the church's records are stored as 07... (10
    digits). WhatsApp's wa.me link needs the international form (2547...),
    so this normalizes the number before it is put in the href. */
function waMeNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  return digits;
}

/** The roster's standard contact sheet: Call, Chat here, WhatsApp, Email.
    Any desk holding an app member record can drop this in as-is. */
export function ContactMemberModal({ member, onClose }: { member: ContactMember; onClose: () => void }) {
  const whatsappNumber = member.whatsapp_number || member.phone_number;

  const chatHere = async () => {
    onClose();
    try {
      await openConversation({ kind: "dm", member_id: member.id });
      // Land the officer directly in the new DM thread rather than leaving
      // them on the roster with a room they still have to find and click.
      window.location.href = `/chat?dm=${member.id}`;
    } catch (error) {
      showAlert("Could not open chat", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  return (
    <ContactModal
      onClose={onClose}
      title={`Contact ${memberDisplayName(member)}`}
      subtitle={member.username ? `@${member.username}` : undefined}
      actions={[
        {
          key: "call",
          icon: <Phone size={14} className="shrink-0 text-ember" aria-hidden="true" />,
          label: "Call",
          detail: member.phone_number || "No phone number on file",
          href: member.phone_number ? `tel:${member.phone_number}` : undefined,
          disabled: !member.phone_number,
          onClick: onClose,
        },
        {
          key: "chat-here",
          icon: <MessageSquare size={14} className="shrink-0 text-ember" aria-hidden="true" />,
          label: "Chat here",
          detail: "Open a direct message in this app",
          onClick: chatHere,
        },
        {
          key: "whatsapp",
          icon: <WhatsAppIcon className="shrink-0 text-ember" />,
          label: "WhatsApp",
          detail: whatsappNumber
            ? `${whatsappNumber}${member.whatsapp_number ? "" : " (phone number)"}`
            : "No number on file",
          href: whatsappNumber ? `https://wa.me/${waMeNumber(whatsappNumber)}` : undefined,
          disabled: !whatsappNumber,
          onClick: onClose,
        },
        {
          key: "email",
          icon: <Mail size={14} className="shrink-0 text-ember" aria-hidden="true" />,
          label: "Email",
          detail: member.email || "No email on file",
          href: member.email ? `mailto:${member.email}` : undefined,
          disabled: !member.email,
          onClick: onClose,
        },
      ]}
    />
  );
}
