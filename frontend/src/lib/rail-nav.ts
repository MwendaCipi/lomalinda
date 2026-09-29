/**
 * Whether the current page's rail is carrying the navigation.
 *
 * The rail is rendered by a page (the member workspace), while the top bar
 * is rendered by the layout above it — so the bar cannot read the rail's
 * presence from the component tree. This tiny module is the channel between
 * them: the rail announces itself on mount, and the bar drops the links it
 * would otherwise duplicate.
 *
 * The rule it serves: a destination is never offered by two navigation
 * surfaces at once. Where the rail carries the church's branches, the top bar
 * is identity only (brand, bell, avatar).
 */

type Listener = (active: boolean) => void;

let active = false;
const listeners = new Set<Listener>();

export function setRailCarriesNav(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener(active);
}

export function railCarriesNav(): boolean {
  return active;
}

export function subscribeRailNav(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
