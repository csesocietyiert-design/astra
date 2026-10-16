"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import type { Contest } from "@/lib/competition";
import { PortalShell } from "@/components/portal-shell";

function contestDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadContests = useCallback(async () => {
    const result = await apiRequest<{ contests: Contest[] }>("/api/contests");
    setContests(result.contests);
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ contests: Contest[] }>("/api/contests")
      .then(({ contests: loadedContests }) => {
        if (active) setContests(loadedContests);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load contests.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateRegistration(contest: Contest) {
    setPendingId(contest.id);
    setActionError("");
    try {
      await apiRequest(`/api/contests/${encodeURIComponent(contest.id)}/register`, {
        method: contest.is_registered ? "DELETE" : "POST",
      });
      await loadContests();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update your contest registration.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <PortalShell>
      <main className="container-shell portal-content py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">Competition</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Contests</h1>
          <p className="mt-2 text-sm text-slate-400">Register for an upcoming contest and track your registration here.</p>
        </div>

        {actionError && (
          <div className="mb-5 text-sm text-rose-300" role="alert">
            {actionError}
            {actionError.toLowerCase().includes("sign in") && <> <Link className="underline" href="/login">Sign in</Link></>}
          </div>
        )}

        {loading ? (
          <div className="panel p-6 text-sm text-slate-300" role="status">Loading contests…</div>
        ) : loadError ? (
          <div className="panel p-6 text-sm text-rose-300" role="alert">{loadError}</div>
        ) : contests.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {contests.map((contest) => (
              <article key={contest.id} className="panel p-6">
                <div className="mb-4 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-violet-200">
                  {contest.status}
                </div>
                <h2 className="text-2xl font-semibold text-white">{contest.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{contest.description}</p>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <p>Starts: {contestDate(contest.starts_at)}</p>
                  <p>Duration: {contest.duration_minutes} minutes</p>
                  <p>{contest.registration_count} registered</p>
                </div>
                {contest.is_registered ? (
                  <button
                    className="mt-5 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50"
                    disabled={!contest.registration_open || pendingId === contest.id}
                    onClick={() => void updateRegistration(contest)}
                    type="button"
                  >
                    {pendingId === contest.id ? "Updating…" : contest.registration_open ? "Registered · Cancel" : "Registered"}
                  </button>
                ) : contest.registration_open ? (
                  <button
                    className="mt-5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={pendingId === contest.id}
                    onClick={() => void updateRegistration(contest)}
                    type="button"
                  >
                    {pendingId === contest.id ? "Registering…" : "Register"}
                  </button>
                ) : (
                  <p className="mt-5 text-sm text-slate-400">Registration closed</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="panel p-8 text-sm text-slate-300">No contests are currently scheduled.</div>
        )}
      </main>
    </PortalShell>
  );
}
