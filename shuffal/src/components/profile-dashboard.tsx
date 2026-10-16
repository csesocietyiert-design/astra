"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Code2, History, Medal, Trophy, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { problems as builtInProblems, type Problem } from "@/lib/data";
import type { Contest, DashboardSubmission, LeaderboardEntry } from "@/lib/competition";
import { DashboardTopbar } from "@/components/dashboard-topbar";

const dailyHeadlines = [
  "Write the syntax of your own success.",
  "Compile your ambition; debug your limits.",
  "Design the logic that defines tomorrow.",
  "Your career is a blank canvas—commit your vision.",
  "Architect your destiny, one line at a time.",
  "Iterate on your dreams until they deploy.",
  "Refactor your mindset to scale new heights.",
  "Engineers don't wait for the future; they code it.",
  "Transform every bug into a stepping stone.",
  "Your potential has no infinite loops—break free.",
  "Execute your purpose with absolute precision.",
  "Merge your passion with relentless persistence.",
  "Build solutions that outlast the codebase.",
  "Initialize your greatness with every keystroke.",
  "Optimize your routine, maximize your impact.",
  "Let your curiosity drive your development.",
  "Every algorithm starts with a single step.",
  "Solve complex problems by breaking them down.",
  "Scale your efforts to match your grandest goals.",
  "Test your limits, then push past the threshold.",
  "Your code carries the weight of your ambition.",
  "Build a legacy that compiles cleanly every time.",
  "Master the fundamentals to conquer any challenge.",
  "Let creativity be the core engine of your logic.",
  "Patch your weaknesses and upgrade your strengths.",
  "Deploy courage into every unfamiliar problem.",
  "Syntax errors are just lessons in disguise.",
  "Run your life with intention and clean structure.",
  "Craft your skills with the precision of a master builder.",
  "Transform abstract ideas into functional reality.",
  "Your journey is a continuous integration of growth.",
  "Keep your vision clear and your code modular.",
  "Solve the hard problems today to lead tomorrow.",
  "Push your boundaries further with every commit.",
  "Turn complex chaos into elegant architecture.",
  "Drive innovation through disciplined execution.",
  "Every line you write shapes who you become.",
  "Build resilient habits that handle any exception.",
  "Program your mind for unstoppable progress.",
  "Chase mastery, not just a passing test case.",
  "Your future is an open-source project—own it.",
  "Deconstruct your doubts and rebuild your confidence.",
  "Keep learning, keep building, keep evolving.",
  "Turn every challenge into a feature, not a bug.",
  "Refine your process until success is automatic.",
  "Let your ambition run faster than your processor.",
  "Write clean logic for a clear and purposeful life.",
  "Shape the digital world with your unique vision.",
  "Unlock your true capacity through deep focus.",
  "Take total ownership of your coding evolution.",
  "Program the habits that automate your excellence.",
  "Let persistence be the constant in your algorithms.",
  "Trace your thoughts and prune away the noise.",
  "Initialize every day with a clear plan and high output.",
  "Scale your mindset beyond traditional constraints.",
  "Debug your fears before they halt your progress.",
  "Write self-documenting goals for your life.",
  "Refactor your routines to eliminate bottlenecks.",
  "Deploy your best effort into everything you touch.",
  "Encapsulate your focus and protect your energy.",
  "Inherit the wisdom of those who came before you.",
  "Polymorph your skills to adapt to any environment.",
  "Cache your successes to fuel future motivation.",
  "Garbage-collect the distractions holding you back.",
  "Bind your dedication tightly to your ambitions.",
  "Catch exceptions gracefully when life throws errors.",
  "Branch out into new domains and expand your reach.",
  "Merge your hard work with smart strategy.",
  "Tag your milestones and celebrate every release.",
  "Clone your best habits and multiply your output.",
  "Stash your worries and commit to the process.",
  "Revert the setbacks and rewrite your narrative.",
  "Fetch fresh knowledge from every experience.",
  "Push your boundaries past every known threshold.",
  "Pull updates from your mentors and peers.",
  "Compare your progress against your past self alone.",
  "Diff your current skills with your ultimate goals.",
  "Log your daily wins to track your trajectory.",
  "Audit your habits to ensure clean execution.",
  "Benchmark your growth against the highest standards.",
  "Profile your time to maximize productivity.",
  "Bootstrap your career from the ground up.",
  "Package your expertise into undeniable value.",
  "Release your potential to the world stage.",
  "Document your journey for those who follow.",
  "Secure your foundation against sudden disruptions.",
  "Authenticate your passion through daily action.",
  "Encrypt your resolve against external doubts.",
  "Validate your ideas through rigorous testing.",
  "Sanitize your inputs and filter out negativity.",
  "Throttle your impatience and trust the timeline.",
  "Synchronize your goals with your daily habits.",
  "Distribute your energy wisely across your tasks.",
  "Load balance your workload to prevent burnout.",
  "Fail fast, learn faster, and iterate endlessly.",
  "Keep your inner state clean and your output pristine.",
  "Master the terminal of your own destiny.",
  "Root your actions in purpose and discipline.",
  "Export your talents and enrich your community.",
  "Take complete control of your coding future.",
];

function getDailyHeadline() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts();
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const dayNumber = Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000);
  return dailyHeadlines[dayNumber % dailyHeadlines.length];
}

function contestDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function submittedDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type UserProfile = {
  id: string;
  account_type: "member" | "outsider";
  email: string;
  first_name: string | null;
  last_name: string | null;
  society_id?: string;
  avatar_url?: string | null;
  profile_complete?: number;
};

export function ProfileDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [featuredProblems, setFeaturedProblems] = useState<Problem[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<DashboardSubmission[]>([]);
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardCount, setLeaderboardCount] = useState<number | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [welcomeToast, setWelcomeToast] = useState("");

  useEffect(() => {
    const firstName = sessionStorage.getItem("astra-welcome-name");
    if (firstName === null) return;
    sessionStorage.removeItem("astra-welcome-name");
    let dismissTimeout: number | undefined;
    const showTimeout = window.setTimeout(() => {
      setWelcomeToast(firstName || "there");
      dismissTimeout = window.setTimeout(() => setWelcomeToast(""), 5000);
    });
    return () => {
      window.clearTimeout(showTimeout);
      if (dismissTimeout !== undefined) window.clearTimeout(dismissTimeout);
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const [result, access] = await Promise.all([
      apiRequest<{ user: UserProfile }>("/api/profile/me"),
      apiRequest<{ is_admin: boolean }>("/api/auth/access"),
    ]);
    setProfile(result.user);
    setIsAdmin(access.is_admin);
  }, []);

  useEffect(() => {
    Promise.resolve()
      .then(refreshProfile)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.message.includes("sign in")) {
          router.replace("/");
          return;
        }
        setError(cause instanceof Error ? cause.message : "Could not load your profile.");
      })
      .finally(() => setLoading(false));
  }, [refreshProfile, router]);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      const [problemResult, contestResult, statsResult, leaderboardResult] = await Promise.allSettled([
        apiRequest<{ problems: Problem[] }>("/api/problems"),
        apiRequest<{ contests: Contest[] }>("/api/contests"),
        apiRequest<{
          total_attempts: number;
          recent_submissions: DashboardSubmission[];
        }>("/api/profile/stats"),
        apiRequest<{ entries: LeaderboardEntry[]; total_entries: number }>("/api/leaderboard"),
      ]);
      if (!active) return;

      const errors: string[] = [];
      if (problemResult.status === "fulfilled") {
        const storedProblems = problemResult.value.problems;
        const storedSlugs = new Set(storedProblems.map(({ slug }) => slug));
        setFeaturedProblems([
          ...storedProblems,
          ...builtInProblems.filter(({ slug }) => !storedSlugs.has(slug)),
        ].slice(0, 3));
      } else {
        setFeaturedProblems(builtInProblems.slice(0, 3));
        errors.push("Problem list");
      }

      if (contestResult.status === "fulfilled") {
        setContests(contestResult.value.contests);
      } else {
        errors.push("contests");
      }

      if (statsResult.status === "fulfilled") {
        setSubmissionCount(statsResult.value.total_attempts);
        setRecentSubmissions(statsResult.value.recent_submissions);
      } else {
        errors.push("submission history");
      }

      if (leaderboardResult.status === "fulfilled") {
        setLeaderboard(leaderboardResult.value.entries);
        setLeaderboardCount(leaderboardResult.value.total_entries);
      } else {
        errors.push("leaderboard");
      }

      setOverviewError(errors.length ? `Could not load ${errors.join(", ")}.` : "");
      setOverviewLoading(false);
    }

    void loadDashboardData();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    setError("");
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (loading) {
    return <main className="dashboard-loading">Loading your profile…</main>;
  }
  if (!profile) {
    return (
      <main className="dashboard-loading">
        <div className="dashboard-load-error">
          <p role="alert">{error || "Could not load your profile."}</p>
          <Link href="/">Return to sign in</Link>
        </div>
      </main>
    );
  }

  const isSocietyMember = Boolean(profile.society_id?.trim());
  const dailyHeadline = getDailyHeadline();
  return (
    <div className="profile-dashboard">
      {welcomeToast && (
        <div className="welcome-toast" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span><strong>Welcome back, {welcomeToast}!</strong><small>Your ASTRA workspace is ready.</small></span>
          <button type="button" onClick={() => setWelcomeToast("")} aria-label="Dismiss welcome message">
            <X size={16} />
          </button>
        </div>
      )}
      <DashboardTopbar
        name={[profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email}
        accountType={isAdmin ? "Admin" : isSocietyMember ? "Society member" : "Guest member"}
        avatarUrl={profile.avatar_url}
        activeHome
        onSignOut={signOut}
      />

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <p className="dashboard-eyebrow">CSE SOCIETY · IERT PRAYAGRAJ</p>
          <h1><span>{dailyHeadline}</span></h1>
          <p className="dashboard-intro">
            Master data structures, algorithms, and problem solving with your ASTRA coding workspace.
          </p>
          <div className="dashboard-hero-actions">
            <Link href="/problems" className="dashboard-primary-action">Start solving <ArrowUpRight size={16} /></Link>
          </div>
        </section>
        {!isSocietyMember && (profile.profile_complete ?? 0) < 100 && (
          <section className="dashboard-profile-incomplete" aria-label="Incomplete guest profile">
            <div>
              <strong>Complete your guest profile</strong>
              <span>{profile.profile_complete ?? 0}% complete. Add only the missing required details.</span>
            </div>
            <Link href="/profile">Complete profile <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </section>
        )}
        {error && <p className="dashboard-message error" role="alert">{error}</p>}

        <section className="dashboard-code-preview" aria-label="ASTRA coding workspace preview">
          <div className="dashboard-editor-toolbar">
            <span className="dashboard-window-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="dashboard-editor-tab"><Code2 size={13} /> solution.py <i /></span>
            <span className="dashboard-editor-ready">SAVED</span>
            <Link href="/submissions" className="dashboard-submit-button">Submit</Link>
            <Link href={`/problems/${featuredProblems[0]?.slug ?? "two-sum"}`} className="dashboard-run-button">
              <Code2 size={14} /> Run Code
            </Link>
          </div>
          <div className="dashboard-editor-body">
            <div className="dashboard-editor-main">
              <div className="dashboard-code-lines" aria-label="Example Python solution">
                <span><i>1</i><code><b>def</b> solve(nums, target):</code></span>
                <span><i>2</i><code>    seen = {"{}"}</code></span>
                <span><i>3</i><code>    <b>for</b> index, value <b>in</b> enumerate(nums):</code></span>
                <span><i>4</i><code>        complement = target - value</code></span>
                <span><i>5</i><code>        <b>if</b> complement <b>in</b> seen:</code></span>
                <span><i>6</i><code>            <b>return</b> [seen[complement], index]</code></span>
                <span><i>7</i><code>        seen[value] = index</code></span>
                <span><i>8</i><code>    <b>return</b> []</code></span>
              </div>
              <div className="dashboard-terminal">
                <div className="dashboard-terminal-heading">
                  <span><i /> TERMINAL</span>
                  <span>›_</span>
                </div>
                <p>Welcome to ASTRA Terminal! <b>»</b></p>
                <span className="dashboard-terminal-prompt">› <i /></span>
              </div>
            </div>
            <aside className="dashboard-editor-aside" aria-label="Code suggestions">
              <div className="dashboard-editor-aside-tabs">
                <span>All Submissions</span>
                <span>Bug Details</span>
              </div>
              <p className="dashboard-editor-aside-title">CODE SUGGESTIONS</p>
              {[
                ["Refactor solution", "Extract repeated logic into reusable helpers for clearer readability."],
                ["Add input validation", "Validate the input before processing."],
                ["Improve spacing", "Use consistent spacing and formatting."],
                ["Implement error handling", "Handle unexpected values and edge cases gracefully."],
                ["Add loading states", "Show feedback while the code is running."],
                ["Optimize re-renders", "Keep the interface responsive and efficient."],
              ].map(([title, description]) => (
                <article className="dashboard-suggestion-card" key={title}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </article>
              ))}
            </aside>
          </div>
        </section>

        <section className="dashboard-overview" aria-labelledby="workspace-heading">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">ASTRA WORKSPACE</p>
              <h2 id="workspace-heading">Your next step starts here</h2>
            </div>
            <Link href="/problems" className="dashboard-view-all">
              Browse all problems <ArrowUpRight size={15} />
            </Link>
          </div>

          <div className="dashboard-stat-grid">
            <Link href="/problems" className="dashboard-stat-card">
              <span className="dashboard-stat-icon"><Code2 size={17} /></span>
              <div><strong>{overviewLoading ? "…" : featuredProblems.length}</strong><span>Featured problems</span></div>
            </Link>
            <Link href="/contests" className="dashboard-stat-card">
              <span className="dashboard-stat-icon"><Trophy size={17} /></span>
              <div><strong>{overviewLoading ? "…" : contests.length}</strong><span>Contest listings</span></div>
            </Link>
            <Link href="/submissions" className="dashboard-stat-card">
              <span className="dashboard-stat-icon"><History size={17} /></span>
              <div><strong>{overviewLoading ? "…" : submissionCount ?? 0}</strong><span>Your submissions</span></div>
            </Link>
            <Link href="/leaderboard" className="dashboard-stat-card">
              <span className="dashboard-stat-icon"><Medal size={17} /></span>
              <div><strong>{overviewLoading ? "…" : leaderboardCount ?? 0}</strong><span>Ranked solvers</span></div>
            </Link>
          </div>
          {overviewError && <p className="dashboard-message error" role="status">{overviewError}</p>}

          <div className="dashboard-content-grid">
            <section className="dashboard-content-card" aria-labelledby="featured-heading">
              <div className="dashboard-card-heading">
                <div>
                  <p className="dashboard-eyebrow">PICK A CHALLENGE</p>
                  <h3 id="featured-heading">Featured problems</h3>
                </div>
                <Link href="/problems" aria-label="View all problems"><ArrowUpRight size={17} /></Link>
              </div>
              <div className="dashboard-problem-list">
                {featuredProblems.map((problem) => (
                  <Link key={problem.slug} href={`/problems/${problem.slug}`} className="dashboard-problem-row">
                    <span><strong>{problem.title}</strong><small>{problem.id} · {problem.topic}</small></span>
                    <span className={`dashboard-difficulty ${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
                  </Link>
                ))}
                {!overviewLoading && featuredProblems.length === 0 && (
                  <p className="dashboard-data-empty">No published problems yet.</p>
                )}
              </div>
            </section>

            <section className="dashboard-content-card" aria-labelledby="contests-heading">
              <div className="dashboard-card-heading">
                <div>
                  <p className="dashboard-eyebrow">COMING UP</p>
                  <h3 id="contests-heading">Contests</h3>
                </div>
                <Link href="/contests" aria-label="View all contests"><ArrowUpRight size={17} /></Link>
              </div>
              <div className="dashboard-contest-list">
                {contests.filter(({ status }) => status !== "Ended").slice(0, 2).map((contest) => (
                  <Link key={contest.id} href="/contests" className="dashboard-contest-row">
                    <span className="dashboard-contest-mark"><Trophy size={15} /></span>
                    <span><strong>{contest.title}</strong><small>{contestDate(contest.starts_at)} · {contest.duration_minutes} minutes · {contest.registration_count} registered</small></span>
                    <span className="dashboard-contest-status">{contest.status}</span>
                  </Link>
                ))}
                {!overviewLoading && contests.filter(({ status }) => status !== "Ended").length === 0 && (
                  <p className="dashboard-data-empty">No upcoming contests.</p>
                )}
              </div>
              <Link href="/contests" className="dashboard-subtle-link">Explore all contests <ArrowUpRight size={14} /></Link>
            </section>
          </div>

          <div className="dashboard-content-grid">
            <section className="dashboard-content-card" aria-labelledby="recent-submissions-heading">
              <div className="dashboard-card-heading">
                <div>
                  <p className="dashboard-eyebrow">YOUR ACTIVITY</p>
                  <h3 id="recent-submissions-heading">Recent submissions</h3>
                </div>
                <Link href="/submissions" aria-label="View submission history"><ArrowUpRight size={17} /></Link>
              </div>
              <div className="dashboard-problem-list">
                {recentSubmissions.slice(0, 3).map((submission) => (
                  <Link key={submission.id} href={`/problems/${submission.problem_slug}`} className="dashboard-problem-row">
                    <span>
                      <strong>{submission.problem_title}</strong>
                      <small>{submission.language} · {submittedDate(submission.created_at)}</small>
                    </span>
                    <span className={`dashboard-difficulty${submission.verdict === "Accepted" ? " easy" : ""}`}>
                      {submission.verdict}
                    </span>
                  </Link>
                ))}
                {!overviewLoading && recentSubmissions.length === 0 && (
                  <p className="dashboard-data-empty">No submissions yet. Choose a problem to get started.</p>
                )}
              </div>
              <Link href="/submissions" className="dashboard-subtle-link">View submission history <ArrowUpRight size={14} /></Link>
            </section>

            <section className="dashboard-content-card" aria-labelledby="leaderboard-preview-heading">
              <div className="dashboard-card-heading">
                <div>
                  <p className="dashboard-eyebrow">SOCIETY RANKINGS</p>
                  <h3 id="leaderboard-preview-heading">Leaderboard</h3>
                </div>
                <Link href="/leaderboard" aria-label="View full leaderboard"><ArrowUpRight size={17} /></Link>
              </div>
              <div className="dashboard-problem-list">
                {leaderboard.slice(0, 3).map((entry) => (
                  <Link key={`${entry.rank}-${entry.name}`} href="/leaderboard" className="dashboard-problem-row">
                    <span><strong>#{entry.rank} · {entry.name}</strong><small>{entry.solved} solved</small></span>
                    <span className="dashboard-contest-status">{entry.points} pts</span>
                  </Link>
                ))}
                {!overviewLoading && leaderboard.length === 0 && (
                  <p className="dashboard-data-empty">Accepted solutions will appear here.</p>
                )}
              </div>
              <Link href="/leaderboard" className="dashboard-subtle-link">View full leaderboard <ArrowUpRight size={14} /></Link>
            </section>
          </div>
        </section>

      </main>
    </div>
  );
}
