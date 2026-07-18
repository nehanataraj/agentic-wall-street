import { redirect } from "next/navigation";

/** Leaderboard removed — agents directory is explicitly unranked. */
export default function LeaderboardRedirect() {
  redirect("/agents");
}
