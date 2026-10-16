"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, Clock3, Flame, Share2, Trophy } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { DashboardTopbar } from "@/components/dashboard-topbar";

type UserProfile = {
  id: string;
  account_type: "member" | "outsider";
  email?: string | null;
  email_address?: string | null;
  first_name: string | null;
  last_name: string | null;
  society_id?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  avatar_url?: string | null;
  aktu_enrollment_number?: string | null;
  admission_batch_year?: number | null;
  branch?: string | null;
  current_year?: string | number | null;
  secondary_email?: string | null;
  mobile_number?: string | null;
  whatsapp_number?: string | null;
  whatsapp_same_as_mobile?: boolean;
  address?: string | null;
  profile_complete?: number;
};

type ActivitySummary = {
  current_streak: number;
  max_streak: number;
  total_active_days: number;
  last_activity_date: string | null;
  today: string;
  activity_dates: string[];
  total_solved: number;
  total_attempts: number;
  attempted_questions: number;
  question_success_rate: number;
  verdict_counts: Record<string, number>;
  difficulty_attempted: Record<"Easy" | "Medium" | "Hard", number>;
  difficulty_solved: Record<"Easy" | "Medium" | "Hard", number>;
  skill_tags: { tag: string; count: number }[];
  focus_areas: { tag: string; questions: number }[];
  recent_submissions: {
    id: string;
    problem_slug: string;
    problem_title: string;
    difficulty: "Easy" | "Medium" | "Hard";
    language: string;
    verdict: string;
    failed_test_case: number | null;
    time_taken_seconds: number | null;
    created_at: string;
  }[];
};

const emptyProfile = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  blood_group: "",
  aktu_enrollment_number: "",
  admission_batch_year: "",
  branch: "",
  secondary_email: "",
  mobile_number: "",
  whatsapp_number: "",
  whatsapp_same_as_mobile: true,
  address: "",
  avatar_url: "",
};

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function activityCalendar(today: string, activeDates: string[]) {
  const lastDay = new Date(`${today}T00:00:00.000Z`);
  const firstDay = new Date(lastDay);
  firstDay.setUTCDate(firstDay.getUTCDate() - 363);
  const leadingDays = firstDay.getUTCDay();
  const active = new Set(activeDates);
  const cells: { date: string; active: boolean }[] = [];

  for (let index = 0; index < leadingDays; index += 1) {
    cells.push({ date: "", active: false });
  }
  for (let index = 0; index < 364; index += 1) {
    const date = new Date(firstDay);
    date.setUTCDate(firstDay.getUTCDate() + index);
    const dateString = date.toISOString().slice(0, 10);
    cells.push({ date: dateString, active: active.has(dateString) });
  }
  return cells;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function submissionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function calculatedYear(batchYear: number | null | undefined) {
  if (!batchYear) return null;
  const academicYear = new Date().getFullYear() - batchYear + (new Date().getMonth() >= 6 ? 1 : 0);
  if (academicYear < 1) return null;
  return academicYear > 4 ? "Completed" : `Year ${academicYear}`;
}

export function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [activityError, setActivityError] = useState("");

  const refreshProfile = useCallback(async () => {
    const [result, access] = await Promise.all([
      apiRequest<{ user: UserProfile }>("/api/profile/me"),
      apiRequest<{ is_admin: boolean }>("/api/auth/access"),
    ]);
    setProfile(result.user);
    setIsAdmin(access.is_admin);
    setPhotoLoadFailed(false);
    setForm({
      first_name: result.user.first_name ?? "",
      last_name: result.user.last_name ?? "",
      date_of_birth: result.user.date_of_birth ?? "",
      gender: result.user.gender ?? "",
      blood_group: result.user.blood_group ?? "",
      aktu_enrollment_number: result.user.aktu_enrollment_number ?? "",
      admission_batch_year: result.user.admission_batch_year?.toString() ?? "",
      branch: result.user.branch ?? "",
      secondary_email: result.user.secondary_email ?? "",
      mobile_number: result.user.mobile_number ?? "",
      whatsapp_number: result.user.whatsapp_number ?? "",
      whatsapp_same_as_mobile: result.user.whatsapp_same_as_mobile ?? true,
      address: result.user.address ?? "",
      avatar_url: result.user.avatar_url ?? "",
    });
  }, []);

  useEffect(() => {
    Promise.resolve()
      .then(refreshProfile)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.message.toLowerCase().includes("sign in")) {
          router.replace("/");
          return;
        }
        setError(cause instanceof Error ? cause.message : "Could not load your profile.");
      })
      .finally(() => setLoading(false));
  }, [refreshProfile, router]);

  useEffect(() => {
    let active = true;
    apiRequest<ActivitySummary>("/api/profile/stats")
      .then((summary) => {
        if (active) setActivity(summary);
      })
      .catch((cause: unknown) => {
        if (active) {
          setActivityError(cause instanceof Error
            ? cause.message
            : "Activity and submission stats are unavailable.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const year = useMemo(
    () => profile?.current_year ?? calculatedYear(Number(form.admission_batch_year) || null),
    [form.admission_batch_year, profile?.current_year],
  );

  function setField<Key extends keyof typeof emptyProfile>(
    key: Key,
    value: (typeof emptyProfile)[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};
      if (missingProfile.first_name) payload.first_name = form.first_name;
      if (missingProfile.last_name) payload.last_name = form.last_name;
      if (missingProfile.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (missingProfile.gender) payload.gender = form.gender;
      if (missingProfile.aktu_enrollment_number) {
        payload.aktu_enrollment_number = form.aktu_enrollment_number;
      }
      if (missingProfile.admission_batch_year) {
        payload.admission_batch_year = Number(form.admission_batch_year);
      }
      if (missingProfile.branch) payload.branch = form.branch;
      if (missingProfile.mobile_number) payload.mobile_number = form.mobile_number;
      if (missingProfile.address) payload.address = form.address;
      if (missingProfile.avatar_url) payload.avatar_url = form.avatar_url;

      const result = await apiRequest<{ user: UserProfile }>("/api/profile/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setProfile(result.user);
      setMessage("Your profile has been saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (loading) return <main className="dashboard-loading">Loading your profile…</main>;
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
  const isGuest = !isSocietyMember;
  const completion = profile.profile_complete ?? 0;
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const email = profile.email || profile.email_address || "";
  const missingProfile = {
    first_name: isMissing(profile.first_name),
    last_name: isMissing(profile.last_name),
    date_of_birth: isMissing(profile.date_of_birth),
    gender: isMissing(profile.gender),
    aktu_enrollment_number: isMissing(profile.aktu_enrollment_number),
    admission_batch_year: isMissing(profile.admission_batch_year),
    branch: isMissing(profile.branch),
    mobile_number: isMissing(profile.mobile_number),
    address: isMissing(profile.address),
    avatar_url: isMissing(profile.avatar_url),
  };
  const missingCount = Object.values(missingProfile).filter(Boolean).length;
  const calendarDays = activity ? activityCalendar(activity.today, activity.activity_dates) : [];
  const activityToday = activity?.today ?? new Date().toISOString().slice(0, 10);
  const availableMemberDetails: [string, string | number | null | undefined][] = [
    ["Society ID", profile.society_id],
    ["Email address", email],
    ["AKTU roll number", profile.aktu_enrollment_number],
    ["Admission year", profile.admission_batch_year],
    ["Branch", profile.branch],
    ["Current year", year],
    ["Mobile number", profile.mobile_number],
  ];

  return (
    <div className="profile-dashboard">
      <DashboardTopbar
        name={displayName || profile.email || profile.email_address || "ASTRA member"}
        accountType={isAdmin ? "Admin" : isSocietyMember ? "Society member" : "Guest member"}
        avatarUrl={profile.avatar_url}
        onSignOut={signOut}
      />

      <main className="profile-analytics-page">
        <div className="profile-analytics-layout">
          <aside className="profile-analytics-sidebar">
            <section className="profile-identity-card">
              <button className="profile-share-button" type="button" aria-label="Share profile" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setMessage("Profile link copied.");
                } catch {
                  setError("Could not copy the profile link.");
                }
              }}>
                <Share2 size={17} aria-hidden="true" />
              </button>
              <div className="profile-analytics-avatar">
                {profile.avatar_url && !photoLoadFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={displayName || "Profile photo"} onError={() => setPhotoLoadFailed(true)} />
                ) : <span>{initialsFor(displayName || email)}</span>}
              </div>
              <h1>{displayName || "ASTRA member"}</h1>
              <p className="profile-identity-email">{email}</p>
              <span className={`profile-account-badge ${isSocietyMember ? "is-society" : "is-guest"}`}>
                {isAdmin ? "Admin" : isSocietyMember ? "CSE Society member" : "Guest member"}
              </span>
              {profile.society_id && <span className="profile-society-id">Society ID · {profile.society_id}</span>}
            </section>

            <section className="profile-progress-card profile-solving-progress-card">
              <h2>Problem solving progress</h2>
              <div className="profile-difficulty-progress">
                {["Easy", "Medium", "Hard"].map((difficulty) => (
                  <div key={difficulty} className={`profile-difficulty-progress-item is-${difficulty.toLowerCase()}`}>
                    <span className="profile-difficulty-ring">
                      <strong>{activity ? activity.difficulty_solved[difficulty as "Easy" | "Medium" | "Hard"] : activityError ? "!" : "…"}</strong>
                    </span>
                    <b>{difficulty}</b>
                    <small>{activity
                      ? `${activity.difficulty_solved[difficulty as "Easy" | "Medium" | "Hard"]} of ${activity.difficulty_attempted[difficulty as "Easy" | "Medium" | "Hard"]} attempted`
                      : activityError ? "Unavailable" : "Loading"}</small>
                  </div>
                ))}
              </div>
              <div className="profile-overall-solving">
                <div><span>Total problems solved</span><strong>{activity ? activity.total_solved : activityError ? "Unavailable" : "Loading"}</strong></div>
                <p>Counts are based on accepted submissions saved to your account.</p>
              </div>
            </section>

            <section className="profile-skills-card">
              <h2>Skill tags</h2>
              <p className="profile-skills-caption">Topics from your accepted solutions</p>
              {activity?.skill_tags.length ? (
                <ol className="profile-skill-tag-list">
                  {activity.skill_tags.slice(0, 6).map(({ tag, count }, index) => (
                    <li key={tag}>
                      <span>{index + 1}</span>
                      <strong>{tag}</strong>
                      <small>× {count}</small>
                      <em>{count >= 10 ? "Expert" : count >= 5 ? "Skilled" : "Learning"}</em>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="profile-skills-empty">
                  {activityError ? activityError : activity ? "Accepted problems will add skill tags here." : "Loading skill tags…"}
                </div>
              )}
            </section>

            <section className="profile-skills-card profile-account-details-card">
              <h2>Account details</h2>
              <p className="profile-skills-caption">{isAdmin ? "Admin account" : isSocietyMember ? "Society membership" : "Guest account"}</p>
              <dl>
                {[
                  ["Email", email],
                  ["AKTU roll number", profile.aktu_enrollment_number],
                  ["Branch", profile.branch],
                  ["Admission year", profile.admission_batch_year],
                  ["Current year", year],
                ].filter((entry): entry is [string, string | number] => (
                  typeof entry[1] === "string" || typeof entry[1] === "number"
                )).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </section>

            <section className="profile-progress-card profile-setup-card">
              <div className="profile-progress-heading"><span>Profile completion</span><strong>{completion}%</strong></div>
              <div className="profile-progress-track"><span style={{ width: `${completion}%` }} /></div>
              <p>{completion === 100 ? "Your profile is complete." : "Add details to complete your profile."}</p>
              <ul>
                {[
                  ["Name", Boolean(profile.first_name && profile.last_name)],
                  ["Profile photo", Boolean(profile.avatar_url)],
                  ["Contact details", Boolean(profile.mobile_number)],
                  ["Academic details", Boolean(profile.aktu_enrollment_number && profile.admission_batch_year && profile.branch)],
                ].map(([label, done]) => (
                  <li key={String(label)} className={done ? "is-complete" : ""}>
                    <span>{done ? <CheckCircle2 size={14} /> : <i />}</span>{String(label)}
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <section className="profile-performance">
            <header className="profile-performance-heading">
              <div>
                <p>YOUR ACTIVITY</p>
                <h2>Performance Overview</h2>
                <span>Track your progress and accepted activity</span>
              </div>
            </header>

            <div className="profile-performance-stats">
              <article>
                <span className="profile-stat-icon"><Trophy size={22} /></span>
                <div><strong>{activity ? activity.total_solved : activityError ? "!" : "…"}</strong><span>TOTAL SOLVED</span></div>
              </article>
              <article>
                <span className="profile-stat-icon"><Activity size={22} /></span>
                <div><strong>{activity ? activity.current_streak : activityError ? "!" : "…"}</strong><span>CURRENT STREAK</span></div>
              </article>
              <article>
                <span className="profile-stat-icon"><Flame size={22} /></span>
                <div><strong>{activity ? activity.max_streak : activityError ? "!" : "…"}</strong><span>BEST STREAK</span></div>
              </article>
            </div>

            <section className="profile-attempt-analysis" aria-labelledby="profile-attempt-analysis-title">
              <div className="profile-attempt-analysis-heading">
                <div>
                  <h3 id="profile-attempt-analysis-title">Attempt analysis</h3>
                  <p>Insights from your judged submissions and distinct questions attempted.</p>
                </div>
                <Link href="/problems">Practice questions</Link>
              </div>
              {activity ? (
                <>
                  <div className="profile-attempt-metrics">
                    <div><strong>{activity.total_attempts}</strong><span>SUBMISSIONS</span></div>
                    <div><strong>{activity.attempted_questions}</strong><span>QUESTIONS ATTEMPTED</span></div>
                    <div><strong>{activity.question_success_rate}%</strong><span>QUESTIONS SOLVED</span></div>
                  </div>
                  <p className="profile-attempt-insight">
                    {activity.total_attempts === 0
                      ? "Submit a solution to start building your performance overview."
                      : activity.focus_areas.length
                        ? `Review ${activity.focus_areas[0].tag}: ${activity.focus_areas[0].questions} attempted question${activity.focus_areas[0].questions === 1 ? "" : "s"} in this area ${activity.focus_areas[0].questions === 1 ? "is" : "are"} not accepted yet.`
                        : "All of your attempted questions have an accepted solution. Try a new difficulty or topic to keep progressing."}
                  </p>
                  <div className="profile-verdict-breakdown" aria-label="Submission verdict breakdown">
                    {Object.entries(activity.verdict_counts).map(([verdict, count]) => (
                      <span key={verdict} className={verdict === "Accepted" ? "is-accepted" : ""}>
                        {verdict}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                  {activity.focus_areas.length > 1 && (
                    <div className="profile-focus-areas">
                      <span>More topics to revisit</span>
                      {activity.focus_areas.slice(1, 4).map(({ tag, questions }) => (
                        <span key={tag}>{tag} · {questions}</span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="profile-attempt-insight">{activityError || "Loading attempt analysis…"}</p>
              )}
            </section>

            <section className="profile-activity-card">
              <div className="profile-activity-heading">
                <div>
                  <strong>{activity ? activity.activity_dates.length : activityError ? "Unavailable" : "…"}</strong>
                  <span>accepted activity days in the past year</span>
                </div>
                <span className="profile-activity-year">Last 12 months</span>
              </div>
              {activity ? (
                <>
                  <div className="profile-activity-months" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, index) => {
                      const monthDate = new Date(`${activityToday}T00:00:00.000Z`);
                      monthDate.setUTCMonth(monthDate.getUTCMonth() - (11 - index), 1);
                      return <span key={monthDate.toISOString()}>{monthDate.toLocaleString("en", { month: "short", timeZone: "UTC" })}</span>;
                    })}
                  </div>
                  <div className="profile-activity-grid" role="img" aria-label={`${activity.activity_dates.length} accepted activity days over the past year`}>
                    {calendarDays.map((day, index) => (
                      <span
                        key={`${day.date || "empty"}-${index}`}
                        className={day.date ? day.active ? "is-active" : "" : "is-empty"}
                        title={day.date ? `${day.date}${day.active ? " · Accepted activity" : ""}` : undefined}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="profile-activity-empty">
                  <Activity size={22} aria-hidden="true" />
                  <p>{activityError || "Loading your activity history…"}</p>
                </div>
              )}
              <div className="profile-activity-footer">
                <div className="profile-activity-legend"><span>Less</span><i /><i className="is-active" /><i className="is-active" /><i className="is-active" /><span>More</span></div>
                <div className="profile-activity-totals">
                  <span>Total active days: <strong>{activity?.total_active_days ?? (activityError ? "Unavailable" : "…")}</strong></span>
                  <i />
                  <span>Best streak: <strong>{activity?.max_streak ?? (activityError ? "Unavailable" : "…")}</strong></span>
                </div>
              </div>
            </section>

            <section className="profile-submissions-card">
              <div className="profile-submissions-heading">
                <Clock3 size={19} aria-hidden="true" />
                <div><h3>Recent submissions</h3><span>Latest judged attempts</span></div>
                <Link href="/submissions">View all</Link>
              </div>
              <div className="profile-submissions-table-head" aria-hidden="true">
                <span>Status</span><span>Problem</span><span>Language</span>
              </div>
              {activity?.recent_submissions.length ? (
                <div className="profile-recent-submissions">
                  {activity.recent_submissions.map((submission) => (
                    <div className="profile-recent-submission" key={submission.id}>
                      <span className={`profile-submission-verdict${submission.verdict === "Accepted" ? " is-accepted" : ""}`}>
                        <i />{submission.verdict}
                      </span>
                      <Link href={`/problems/${submission.problem_slug}`}>{submission.problem_title}</Link>
                      <span>{submission.language}</span>
                      <div>
                        <time dateTime={submission.created_at}>{submissionTime(submission.created_at)}</time>
                        {submission.time_taken_seconds !== null && (
                          <small>Session: {submission.time_taken_seconds}s</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-submissions-empty">
                  <p>{activityError ? activityError : "No judged submissions have been recorded yet."}</p>
                  <Link href="/problems">Explore problems</Link>
                </div>
              )}
            </section>
          </section>
        </div>

        {error && <p className="dashboard-message error" role="alert">{error}</p>}
        {message && <p className="dashboard-message success" role="status">{message}</p>}

        {isGuest ? (
          <section className="profile-edit-card profile-edit-section">
            <div className="profile-card-heading">
              <div>
                <h2>Complete your profile</h2>
                <p>We’ll ask only for the required details that are still missing from your ASTRA profile.</p>
              </div>
              <span className="profile-private-label">Private by default</span>
            </div>
            {missingCount > 0 ? (
              <form className="profile-form" onSubmit={handleSave}>
                <div className="profile-form-grid">
                  {missingProfile.first_name && (
                    <div className="profile-field">
                      <label htmlFor="profile-first-name">First name</label>
                      <input id="profile-first-name" autoComplete="given-name" value={form.first_name} onChange={(event) => setField("first_name", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.last_name && (
                    <div className="profile-field">
                      <label htmlFor="profile-last-name">Last name</label>
                      <input id="profile-last-name" autoComplete="family-name" value={form.last_name} onChange={(event) => setField("last_name", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.date_of_birth && (
                    <div className="profile-field">
                      <label htmlFor="profile-dob">Date of birth</label>
                      <input id="profile-dob" type="date" value={form.date_of_birth} onChange={(event) => setField("date_of_birth", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.gender && (
                    <div className="profile-field">
                      <label htmlFor="profile-gender">Gender</label>
                      <select id="profile-gender" value={form.gender} onChange={(event) => setField("gender", event.target.value)} required>
                        <option value="">Select gender</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="non_binary">Non-binary</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                    </div>
                  )}
                  {missingProfile.aktu_enrollment_number && (
                    <div className="profile-field">
                      <label htmlFor="profile-enrollment">AKTU enrollment number</label>
                      <input id="profile-enrollment" value={form.aktu_enrollment_number} onChange={(event) => setField("aktu_enrollment_number", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.admission_batch_year && (
                    <div className="profile-field">
                      <label htmlFor="profile-batch">Admission batch year</label>
                      <input id="profile-batch" type="number" min="2000" max="2100" value={form.admission_batch_year} onChange={(event) => setField("admission_batch_year", event.target.value)} placeholder="e.g. 2024" required />
                    </div>
                  )}
                  {missingProfile.branch && (
                    <div className="profile-field">
                      <label htmlFor="profile-branch">Branch</label>
                      <select id="profile-branch" value={form.branch} onChange={(event) => setField("branch", event.target.value)} required>
                        <option value="">Select branch</option>
                        {["Computer Science & Engineering", "Information Technology", "Electronics Engineering", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Other"].map((branch) => <option key={branch}>{branch}</option>)}
                      </select>
                    </div>
                  )}
                  {missingProfile.mobile_number && (
                    <div className="profile-field">
                      <label htmlFor="profile-mobile">Mobile number</label>
                      <input id="profile-mobile" type="tel" autoComplete="tel" value={form.mobile_number} onChange={(event) => setField("mobile_number", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.address && (
                    <div className="profile-field profile-field-wide">
                      <label htmlFor="profile-address">Current address</label>
                      <textarea id="profile-address" rows={3} value={form.address} onChange={(event) => setField("address", event.target.value)} required />
                    </div>
                  )}
                  {missingProfile.avatar_url && (
                    <div className="profile-field profile-field-wide">
                      <label htmlFor="profile-avatar-url">Public profile photo link</label>
                      <input id="profile-avatar-url" type="url" inputMode="url" value={form.avatar_url} onChange={(event) => setField("avatar_url", event.target.value)} placeholder="https://…" required />
                      <small>Use an HTTPS image link that is publicly accessible.</small>
                    </div>
                  )}
                </div>
                <div className="profile-form-actions">
                  <p>Missing details are saved to your ASTRA guest profile.</p>
                  <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save missing details"}</button>
                </div>
              </form>
            ) : (
              <p className="profile-setup-complete" role="status">Your required profile details are complete.</p>
            )}
          </section>
        ) : (
          <section className="profile-edit-card profile-edit-section">
            <div className="profile-card-heading">
              <div><h2>Membership profile</h2><p>Your society membership information is shown here as read-only.</p></div>
              <span className="profile-private-label">{isAdmin ? "Admin" : "Society member"}</span>
            </div>
            <dl className="member-profile-fields">
              {availableMemberDetails.filter((entry): entry is [string, string | number] => (
                typeof entry[1] === "string" || typeof entry[1] === "number"
              )).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
