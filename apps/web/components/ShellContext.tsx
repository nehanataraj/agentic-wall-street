"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { mixedFeed } from "../lib/demo-data";

type Drawer = "left" | "right" | null;

const PIN_STORAGE_KEY = "prediction-ledger:pinned-post-ids:v1";
const KNOWN_POST_IDS = new Set(mixedFeed().map((post) => post.id));

type ShellContextValue = {
  drawer: Drawer;
  open: (d: Drawer) => void;
  close: () => void;
  exposure: "exposed" | "blind";
  toggleExposure: () => void;
  pinnedIds: readonly string[];
  pinsReady: boolean;
  isPinned: (postId: string) => boolean;
  togglePin: (postId: string) => void;
};

const ShellCtx = createContext<ShellContextValue | null>(null);

function normalizePinnedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.filter((postId): postId is string => {
    if (
      typeof postId !== "string" ||
      !KNOWN_POST_IDS.has(postId) ||
      seen.has(postId)
    ) {
      return false;
    }
    seen.add(postId);
    return true;
  });
}

function readStoredPins(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return normalizePinnedIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell outside provider");
  return ctx;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [exposure, setExposure] = useState<"exposed" | "blind">("exposed");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);

  useEffect(() => {
    try {
      setPinnedIds(readStoredPins(localStorage.getItem(PIN_STORAGE_KEY)));
    } catch {
      setPinnedIds([]);
    }
    setPinsReady(true);

    const syncPins = (event: StorageEvent) => {
      if (event.key === PIN_STORAGE_KEY) {
        setPinnedIds(readStoredPins(event.newValue));
      }
    };
    window.addEventListener("storage", syncPins);
    return () => window.removeEventListener("storage", syncPins);
  }, []);

  const pinnedIdSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const isPinned = useCallback(
    (postId: string) => pinnedIdSet.has(postId),
    [pinnedIdSet]
  );
  const togglePin = useCallback((postId: string) => {
    if (!KNOWN_POST_IDS.has(postId)) return;

    setPinnedIds((current) => {
      const next = current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [postId, ...current];
      try {
        localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep pinning functional in memory when browser storage is unavailable.
      }
      return next;
    });
  }, []);
  const close = useCallback(() => setDrawer(null), []);
  const toggleExposure = useCallback(
    () => setExposure((value) => (value === "exposed" ? "blind" : "exposed")),
    []
  );

  const value = useMemo<ShellContextValue>(
    () => ({
      drawer,
      open: setDrawer,
      close,
      exposure,
      toggleExposure,
      pinnedIds,
      pinsReady,
      isPinned,
      togglePin,
    }),
    [
      close,
      drawer,
      exposure,
      isPinned,
      pinnedIds,
      pinsReady,
      toggleExposure,
      togglePin,
    ]
  );

  return (
    <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>
  );
}
