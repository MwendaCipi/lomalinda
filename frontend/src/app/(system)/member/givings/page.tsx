"use client";

import { MyGivings } from "@/components/my-givings";
import { MemberWorkspace } from "@/components/member-workspace";

/**
 * My Givings — the member's giving records, on their own route.
 *
 * The record moved here from the pages that used to *be* the record and push
 * the act of giving behind a modal: money from /give, in-kind from
 * /support/in-kind. The account menu links this route (`myGivings` in the
 * navigation registry, which also names the page above), and what it opens is
 * one timeline — money gifts and in-kind gifts merged, grouped by day, under
 * one eye switch.
 */
export default function MyGivingsPage() {
  return (
    <MemberWorkspace>
      <MyGivings />
    </MemberWorkspace>
  );
}
