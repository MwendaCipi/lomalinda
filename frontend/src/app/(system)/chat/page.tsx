import { Suspense } from "react";
import { ChatPanel } from "@/components/chat-panel";

/**
 * Chat — the church talking to itself: the area rooms a member belongs to,
 * direct messages between members, and a thread to the church office. A phone
 * reaches it from the bottom bar and a PC from the top bar's own button.
 *
 * The panel reads the URL's search params (to auto-open a ?dm= thread), which
 * Next.js requires to be wrapped in a Suspense boundary during SSR.
 */
export default function ChatPage() {
  return (
    <Suspense fallback={(
      <div className="flex h-full min-h-0 items-center justify-center text-moss">
        <p className="text-sm">Loading chat…</p>
      </div>
    )}>
      <ChatPanel />
    </Suspense>
  );
}
