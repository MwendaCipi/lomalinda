"use client";

/**
 * Row padding, fixed at the comfortable height.
 *
 * The compact toggle is gone: one roomy row height on every desk, so the
 * tables read the same to everyone. The helper keeps its old name and shape
 * so every table still reads `densityCellPad()` without learning anything.
 */
export function densityCellPad(): string {
  return "py-3";
}
