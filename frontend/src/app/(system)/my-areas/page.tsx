import { Suspense } from "react";
import { MyAreas } from "@/components/my-areas";

/**
 * Ministry — the church's ministries and departments as the member's own map.
 * Two sub-navs split the areas they belong to from the ones they could join;
 * opening one reads it, read-only. The open area and its view are the address
 * bar's own (`?area=` and `?view=`), so the search params this page reads
 * arrive inside a Suspense boundary, as the console's own page does.
 */
export default function MyAreasPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
          Loading Ministry...
        </main>
      }
    >
      <MyAreas />
    </Suspense>
  );
}
