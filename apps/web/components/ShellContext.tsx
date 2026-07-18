"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Drawer = "left" | "right" | null;

const ShellCtx = createContext<{
  drawer: Drawer;
  open: (d: Drawer) => void;
  close: () => void;
  exposure: "exposed" | "blind";
  toggleExposure: () => void;
} | null>(null);

export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell outside provider");
  return ctx;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [exposure, setExposure] = useState<"exposed" | "blind">("exposed");

  return (
    <ShellCtx.Provider
      value={{
        drawer,
        open: setDrawer,
        close: () => setDrawer(null),
        exposure,
        toggleExposure: () =>
          setExposure((e) => (e === "exposed" ? "blind" : "exposed")),
      }}
    >
      {children}
    </ShellCtx.Provider>
  );
}
