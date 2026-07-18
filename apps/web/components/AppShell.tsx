"use client";

import { ShellProvider, useShell } from "./ShellContext";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { drawer, close } = useShell();

  return (
    <div className="app-shell">
      <TopBar />
      <div
        className="drawer-backdrop"
        data-open={drawer !== null}
        onClick={close}
        aria-hidden
      />
      <div className="shell-body">
        <LeftRail />
        <main className="center-col">{children}</main>
        <RightRail />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellInner>{children}</ShellInner>
    </ShellProvider>
  );
}
