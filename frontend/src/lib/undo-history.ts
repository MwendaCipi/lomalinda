"use client";

/**
 * Office-style undo and redo for one editable value.
 *
 * The editor commits checkpoints — every structural move (a session added,
 * dragged, merged, removed) is one; a streak of typing is one — and the two
 * buttons walk back and forward through them, as a word processor's do.
 * The live value stays the plain state the editor already read, so the
 * sheet needs no other change than calling `commit` where it called the
 * setter, and undoing can itself be undone with redo.
 *
 * Typing coalesces: commits inside the coalesce window share a checkpoint,
 * so undo steps back a thought rather than a keypress. A commit after a
 * pause (or a drag or an add) opens a fresh one.
 */

import { useCallback, useRef, useState } from "react";

export type UndoHistory<T> = {
  /** The value as it stands — the editor reads this in place of its state. */
  current: T;
  /** Record a change. `coalesce` folds consecutive commits (typing) into
   *  one checkpoint when they arrive within the window. */
  commit: (updater: T | ((current: T) => T), coalesce?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useUndoHistory<T>(initial: T, coalesceMs = 700, depth = 100): UndoHistory<T> {
  const [state, setState] = useState<T>(initial);
  // The stacks live in refs — they are history, not render output — while
  // the two counts the buttons read are render output, so the buttons
  // repaint when the stacks move.
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  // The mirror of `state` lives in a ref too — commit, undo and redo each
  // keep it current as they run, so a commit never reads a stale sheet —
  // while render reads only `state` itself.
  const stateRef = useRef<T>(initial);
  const [marks, setMarks] = useState({ undo: 0, redo: 0 });
  const lastCommitAt = useRef(0);

  const publish = useCallback(() => setMarks({ undo: pastRef.current.length, redo: futureRef.current.length }), []);

  const commit = useCallback(
    (updater: T | ((current: T) => T), coalesce = false) => {
      const current = stateRef.current;
      const next = typeof updater === "function" ? (updater as (pending: T) => T)(current) : updater;
      if (next === current) return;
      const now = Date.now();
      if (!coalesce || now - lastCommitAt.current > coalesceMs) {
        pastRef.current = [...pastRef.current.slice(-(depth - 1)), current];
        futureRef.current = [];
      }
      lastCommitAt.current = now;
      stateRef.current = next;
      setState(next);
      publish();
      },
    [depth, publish, coalesceMs]
  );

  const undo = useCallback(() => {
    const current = stateRef.current;
    const previous = pastRef.current[pastRef.current.length - 1];
    if (previous === undefined) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [current, ...futureRef.current].slice(0, depth);
    // A fresh action after an undo starts a new checkpoint, not a
    // continuation of the streak the undo just closed.
    lastCommitAt.current = 0;
    stateRef.current = previous;
    setState(previous);
    publish();
  }, [depth, publish]);

  const redo = useCallback(() => {
    const current = stateRef.current;
    const [next, ...restFuture] = futureRef.current;
    if (next === undefined) return;
    futureRef.current = restFuture;
    pastRef.current = [...pastRef.current.slice(-(depth - 1)), current];
    lastCommitAt.current = 0;
    stateRef.current = next;
    setState(next);
    publish();
  }, [depth, publish]);

  return { current: state, commit, undo, redo, canUndo: marks.undo > 0, canRedo: marks.redo > 0 };
}
