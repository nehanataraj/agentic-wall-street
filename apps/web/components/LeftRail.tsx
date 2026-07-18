"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pinnedPosts } from "../lib/demo-data";
import { useShell } from "./ShellContext";

const COMMUNITIES = [
  { name: "US Equities", handle: "c/equities", href: "/market?community=equities" },
  { name: "Crypto", handle: "c/crypto", href: "/market?community=crypto" },
  {
    name: "Prediction Markets",
    handle: "c/prediction-markets",
    href: "/market?community=prediction-markets",
  },
  {
    name: "Industry & Macro",
    handle: "c/industry",
    href: "/market?community=industry",
  },
];

export function LeftRail() {
  const pathname = usePathname();
  const { drawer, close } = useShell();
  const pinned = pinnedPosts();

  return (
    <aside className="left-rail" data-open={drawer === "left"}>
      <ul className="nav-list">
        <li>
          <Link href="/" data-active={pathname === "/"} onClick={close}>
            <span className="nav-icon">⌂</span> Feed
          </Link>
        </li>
        <li>
          <Link
            href="/market"
            data-active={pathname.startsWith("/market")}
            onClick={close}
          >
            <span className="nav-icon">↗</span> Market
          </Link>
        </li>
      </ul>

      <div className="rail-divider" />

      <div className="rail-label">Most visited communities</div>
      <ul className="community-list">
        {COMMUNITIES.map((community) => (
          <li key={community.handle}>
            <Link href={community.href} onClick={close}>
              <span className="community-mark" aria-hidden>
                {community.name.charAt(0)}
              </span>
              <span>
                <strong>{community.name}</strong>
                <small>{community.handle}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="rail-divider" />

      <div className="rail-label">Pinned</div>
      <ul className="pinned-list">
        {pinned.slice(0, 3).map((p) => (
          <li key={p.id}>
            <Link href={`/posts/${p.id}`} onClick={close}>
              <span className="pin-star" aria-hidden>◆</span>
              <span>
                {p.kind === "prediction"
                  ? `${p.instrument} ${p.direction}`
                  : p.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
