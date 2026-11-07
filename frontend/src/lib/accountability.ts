import { dayFirst } from "@/lib/dates";

/** One line of a spending account: what was bought, for how much, when, its
    receipt, and the exact filed line it came from (null for rows the desk
    added and has not filed yet — only a row with a source has a database
    line a deletion can remove). */
export type AccountRow = { id: number; item: string; amount: string; spentOn: string; receipt: File | null; source: string | null };

/**
 * A row amount counts only when it is a plain positive number with at most
 * two decimals — no words, no negatives, no zero-amount lines.
 */
export function parseAccountAmount(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const num = Number(text);
  return num > 0 ? num : null;
}

/** "12/05/2026" → "2026-05-12"; null when the text is not a real calendar date. */
export function dayFirstToIso(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/**
 * Read a previously filed account back into editable rows. Lines already in
 * the "item — amount · date" shape split back into rows; older free text
 * becomes one row's item so nothing ever typed is lost. No lines means no
 * rows — the form starts empty and the desk adds what it needs.
 */
export function accountNotesToRows(notes: string, startId: number): { rows: AccountRow[]; nextId: number } {
  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let nextId = startId;
  const rows = lines.map((line) => {
    const match = /^(.*?)\s*[—–-]\s*([\d,]+(?:\.\d{1,2})?)(?:\s*·\s*(\d{1,2}\/\d{1,2}\/\d{4}))?\s*$/.exec(line);
    return {
      id: nextId++,
      item: (match ? match[1] : line).trim(),
      amount: match ? match[2].replace(/,/g, "") : "",
      spentOn: match?.[3] ? (dayFirstToIso(match[3]) ?? "") : "",
      receipt: null as File | null,
      source: line,
    };
  });
  return { rows, nextId };
}

/** One filed line as the treasury reads it back: the item, its amount and its date. */
export function readAccountingLines(notes: string): { item: string; amount: number | null; date: string }[] {
  return accountNotesToRows(notes, 1).rows.map((row) => ({
    item: row.item,
    amount: parseAccountAmount(row.amount),
    date: row.spentOn ? dayFirst(row.spentOn) : "",
  }));
}
