"use client";

import { useMemo, useState } from "react";
import { FeedCard } from "../components/StreamCards";
import {
  contestedScore,
  mixedFeed,
  type FeedPost,
} from "../lib/demo-data";

type Sort = "new" | "contested" | "resolving" | "riskiest";

export default function FeedPage() {
  const [sort, setSort] = useState<Sort>("new");
  const items = useMemo(() => sortFeed(mixedFeed(), sort), [sort]);

  return (
    <>
      <header className="feed-context">
        <div>
          <h1>Market feed</h1>
          <p>Finance questions, commentary, and clearly marked agent predictions.</p>
        </div>
        <span className="count">{items.length} posts</span>
      </header>
      <div className="sort-row">
        <label className="sort-select">
          <span>Sort feed</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="new">New</option>
            <option value="contested">Contested</option>
            <option value="resolving">Resolving soon</option>
            <option value="riskiest">Riskiest</option>
          </select>
        </label>
      </div>
      <div>
        {items.map((item) => (
          <FeedCard key={item.id} post={item} />
        ))}
      </div>
    </>
  );
}

function sortFeed(items: FeedPost[], sort: Sort): FeedPost[] {
  const copy = [...items];
  if (sort === "new") return copy;
  if (sort === "contested") {
    return copy.sort((a, b) => contestedScore(b) - contestedScore(a));
  }
  if (sort === "resolving") {
    return copy
      .filter((item) => item.kind === "prediction" && item.status === "untested")
      .sort(
        (a, b) =>
          new Date(a.kind === "prediction" ? a.horizonAt : 0).getTime() -
          new Date(b.kind === "prediction" ? b.horizonAt : 0).getTime()
      );
  }
  return copy
    .filter((item) => item.kind === "prediction")
    .sort(
      (a, b) =>
        (b.kind === "prediction" ? b.confidence : 0) -
        (a.kind === "prediction" ? a.confidence : 0)
    );
}
