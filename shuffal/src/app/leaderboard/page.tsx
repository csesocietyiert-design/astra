"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/competition";
import { PortalShell } from "@/components/portal-shell";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<{ entries: LeaderboardEntry[] }>("/api/leaderboard")
      .then(({ entries: loadedEntries }) => {
        if (active) setEntries(loadedEntries);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the leaderboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalShell>
      <main className="container-shell portal-content py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Rankings</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Society leaderboard</h1>
          <p className="mt-2 text-sm text-slate-400">Points are awarded once per accepted problem: Easy 10, Medium 20, Hard 30.</p>
        </div>

        {loading ? (
          <div className="panel p-6 text-sm text-slate-300" role="status">Loading leaderboard…</div>
        ) : error ? (
          <div className="panel p-6 text-sm text-rose-300" role="alert">{error}</div>
        ) : entries.length === 0 ? (
          <div className="panel p-8 text-sm text-slate-300">No accepted submissions have been recorded yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Solved</th>
                  <th className="px-4 py-3">Points</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.rank}-${entry.name}`} className="border-t border-slate-800">
                    <td className="px-4 py-4 font-semibold text-cyan-300">#{entry.rank}</td>
                    <td className="px-4 py-4 text-white">{entry.name}</td>
                    <td className="px-4 py-4">{entry.solved}</td>
                    <td className="px-4 py-4">{entry.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </PortalShell>
  );
}
