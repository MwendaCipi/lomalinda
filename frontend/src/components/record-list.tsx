import { Fragment, type ReactNode } from "react";

/**
 * One renderer for every "table on desktop, cards on phone" list.
 *
 * Each manager used to hand-write both layouts — a `hidden md:block` table
 * and a sibling card grid — and keep their visibility, keys, and
 * loading/empty states in sync by hand; when the pair drifted, desktop
 * rendered every record twice. This component owns that pair: the breakpoint
 * classes, the row iteration with shared keys, and the four state cells.
 * Callers keep their own column headers, row cells, and card markup.
 *
 * A list that is cards at every width (the announcement board) sets
 * `cardsOnly` and skips the table columns rather than keeping a dead set of
 * row cells around to satisfy the props.
 */

export type RecordListHeader = { label: ReactNode; className?: string };

type RecordListProps<T> = {
  rows: readonly T[];
  loading: boolean;
  /** Key for a record, shared by its table row and its card. */
  rowKey: (row: T, index: number) => string | number;
  /** Columns for the desktop table; omitted by cards-only lists. */
  headers?: RecordListHeader[];
  /** The `<tr>` (cells only decided by you) for the desktop table. */
  renderRow?: (row: T, index: number) => ReactNode;
  /** Cards at every width, for a list that is cards even on desktop. */
  cardsOnly?: boolean;
  /** The card element for the phone layout. */
  renderCard: (row: T, index: number) => ReactNode;
  loadingLabel: string;
  /** Empty-state content per layout; each falls back to the other's. */
  tableEmpty?: ReactNode;
  cardsEmpty?: ReactNode;
  /** Hide both layouts (another view is showing in their place). */
  hidden?: boolean;
  /** Extra classes for the desktop wrapper (scrollbars, borders, sizing). */
  tableWrapperClassName?: string;
  tableClassName?: string;
  headClassName?: string;
  headRowClassName?: string;
  headCellClassName?: string;
  bodyClassName?: string;
  /** Extra classes for the cards wrapper (it always gets `md:hidden`). */
  cardsClassName?: string;
  /** Wrapper classes for loading/empty cells and card states. */
  stateClassName?: string;
  tableEmptyClassName?: string;
  /** Cards-side state classes when they differ from the table's. */
  cardsStateClassName?: string;
};

const STATE_CLASS = "py-8 text-center text-xs text-[#617068]";

export function RecordList<T>({
  rows,
  loading,
  rowKey,
  headers,
  renderRow,
  renderCard,
  loadingLabel,
  tableEmpty,
  cardsEmpty,
  cardsOnly = false,
  hidden = false,
  tableWrapperClassName = "",
  tableClassName = "w-full text-left text-xs",
  headClassName = "sticky top-0 z-10 bg-white border-b border-[#dfdbd1]",
  headRowClassName = "text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]",
  headCellClassName = "pb-3 font-bold",
  bodyClassName = "divide-y divide-[#eeeae2]",
  cardsClassName = "grid gap-3",
  stateClassName = STATE_CLASS,
  tableEmptyClassName,
  cardsStateClassName = stateClassName,
}: RecordListProps<T>) {
  const span = headers?.length ?? 1;
  const emptyTable = tableEmpty ?? cardsEmpty;
  const emptyCards = cardsEmpty ?? tableEmpty;
  const showTable = !cardsOnly && Boolean(renderRow);

  return (
    <>
      {showTable && (
      <div className={`${tableWrapperClassName} ${hidden ? "hidden" : "hidden md:block"}`.trim()}>
        <table className={tableClassName}>
          <thead className={headClassName}>
            <tr className={headRowClassName}>
              {(headers ?? []).map((header, index) => (
                <th
                  key={index}
                  className={[headCellClassName, header.className].filter(Boolean).join(" ")}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={bodyClassName}>
            {loading ? (
              <tr>
                <td colSpan={span} className={stateClassName}>
                  {loadingLabel}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={span} className={tableEmptyClassName ?? stateClassName}>
                  {emptyTable}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <Fragment key={rowKey(row, index)}>{renderRow?.(row, index)}</Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      <div className={hidden ? "hidden" : cardsOnly ? cardsClassName : `${cardsClassName} md:hidden`.trim()}>
        {loading ? (
          <div className={cardsStateClassName}>{loadingLabel}</div>
        ) : rows.length === 0 ? (
          <div className={cardsStateClassName}>{emptyCards}</div>
        ) : (
          rows.map((row, index) => (
            <Fragment key={rowKey(row, index)}>{renderCard(row, index)}</Fragment>
          ))
        )}
      </div>
    </>
  );
}
