import { PrayerCellsHub } from "@/components/prayer-cells";

/**
 * Prayer Cells — the fellowship's sixth toggle.
 *
 * A page of the register: every cell the church keeps, read by any member,
 * with the ask to join riding each card. Signed out the page stays blank of
 * the register (the desk's API answers only a signed-in reader), so the main
 * renders the hub component, which keeps its own signed-in shape.
 */
export default function PrayerCellsPage() {
  return (
    <main className="h-full min-h-0 bg-white text-bark">
      <div className="mx-auto max-w-3xl px-5 py-5 sm:px-8 lg:px-10">
        <PrayerCellsHub />
      </div>
    </main>
  );
}
