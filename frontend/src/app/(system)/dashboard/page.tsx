import { MemberHome } from "@/components/member-home";

/**
 * The signed-in system dashboard: greeting, quick tiles, announcements,
 * giving history and notifications. Lives inside the (system) group so the
 * sign-in gate and system chrome apply.
 */
export default function DashboardPage() {
  return <MemberHome />;
}
