/**
 * festivalChecklistRepo — per-festival checklist state the user owns.
 *
 * The app ships a built-in list of shopping / arrangement items for each
 * festival in the Panchang catalogue (poojaSet, flowers, prasad, etc).
 * Those are read-only — the user cannot edit the catalog. But the status
 * of each item ("I bought it", "I still need it") is a user fact, and
 * the user may want to add their own items on top of what the catalog
 * suggests ("mehndi for my mother-in-law", "rent a dhoti").
 *
 * This repo stores the per-festival overlay in one AsyncStorage blob:
 *   checkedIds — which built-in items the user has crossed off
 *   extras     — their own added items + whether each is checked
 *
 * Reset per festival when the next occurrence comes round (callers can
 * call `clear(festivalId)` for that).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sr.festival.checklist.v1';

export interface ExtraItem {
  id: string;
  text: string;
  tag?: string;      // optional tag, defaults to "ADDED"
  checked: boolean;
  addedAt: number;
}

export interface FestivalChecklistOverlay {
  /** Built-in checklist item ids the user has ticked off. */
  checkedIds: string[];
  /** Items the user added on top of the catalog, in the order they added. */
  extras: ExtraItem[];
}

type Store = Record<string, FestivalChecklistOverlay>;

const empty = (): FestivalChecklistOverlay => ({ checkedIds: [], extras: [] });

const load = async (): Promise<Store> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
};

const save = async (store: Store): Promise<void> => {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
};

export const festivalChecklistRepo = {
  /** Read this festival's overlay. Always returns a defined value. */
  async read(festivalId: string): Promise<FestivalChecklistOverlay> {
    const store = await load();
    return store[festivalId] ?? empty();
  },

  /** Toggle a built-in item. Returns the new overlay. */
  async toggleBuiltIn(festivalId: string, itemId: string): Promise<FestivalChecklistOverlay> {
    const store = await load();
    const cur = store[festivalId] ?? empty();
    const next: FestivalChecklistOverlay = cur.checkedIds.includes(itemId)
      ? { ...cur, checkedIds: cur.checkedIds.filter(x => x !== itemId) }
      : { ...cur, checkedIds: [...cur.checkedIds, itemId] };
    store[festivalId] = next;
    await save(store);
    return next;
  },

  /** Toggle a user-added extra item. */
  async toggleExtra(festivalId: string, extraId: string): Promise<FestivalChecklistOverlay> {
    const store = await load();
    const cur = store[festivalId] ?? empty();
    const next: FestivalChecklistOverlay = {
      ...cur,
      extras: cur.extras.map(e => e.id === extraId ? { ...e, checked: !e.checked } : e),
    };
    store[festivalId] = next;
    await save(store);
    return next;
  },

  /** Add a user item. Empty / whitespace-only text is ignored. */
  async addExtra(festivalId: string, text: string): Promise<FestivalChecklistOverlay> {
    const trimmed = text.trim();
    if (!trimmed) return (await load())[festivalId] ?? empty();
    const store = await load();
    const cur = store[festivalId] ?? empty();
    const extra: ExtraItem = {
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: trimmed,
      tag: 'ADDED',
      checked: false,
      addedAt: Date.now(),
    };
    const next: FestivalChecklistOverlay = { ...cur, extras: [...cur.extras, extra] };
    store[festivalId] = next;
    await save(store);
    return next;
  },

  /** Remove a user item. */
  async removeExtra(festivalId: string, extraId: string): Promise<FestivalChecklistOverlay> {
    const store = await load();
    const cur = store[festivalId] ?? empty();
    const next: FestivalChecklistOverlay = {
      ...cur,
      extras: cur.extras.filter(e => e.id !== extraId),
    };
    store[festivalId] = next;
    await save(store);
    return next;
  },

  /** Reset a festival's overlay — used when the next year's occurrence starts. */
  async clear(festivalId: string): Promise<void> {
    const store = await load();
    delete store[festivalId];
    await save(store);
  },
};
