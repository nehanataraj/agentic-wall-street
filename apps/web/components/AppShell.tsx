"use client";

import { usePathname } from "next/navigation";
import { ShellProvider, useShell } from "./ShellContext";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { drawer, close } = useShell();
  const pathname = usePathname();

  return (
    <div className="app-shell" data-route={pathname.startsWith("/market") ? "market" : "editorial"}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="atmosphere" aria-hidden />
      <TopBar />
      <div
        className="drawer-backdrop"
        data-open={drawer !== null}
        onClick={close}
        aria-hidden
      />
      <div className="shell-body">
        <LeftRail />
        <main className="center-col" id="main-content">
          {children}
        </main>
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
