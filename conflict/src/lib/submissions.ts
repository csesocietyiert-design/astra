import type { SessionClaims } from "./session.js";
import { getSupabaseAdmin } from "./supabase.js";
import { isMissingStorageError, RequiredStorageError } from "./storage-errors.js";

export type SubmissionRecord = {
  id: string;
  problem_slug: string;
  problem_title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  problem_tags: string[];
  language: string;
  verdict: string;
  failed_test_case: number | null;
  source_code: string | null;
  passed_test_cases: number | null;
  total_test_cases: number | null;
  execution_time: number | null;
  memory_kb: number | null;
  diagnostic: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  time_taken_seconds: number | null;
  created_at: string;
};

export type AttemptSummaryRow = Pick<
  SubmissionRecord,
  "problem_slug" | "problem_title" | "difficulty" | "problem_tags" | "verdict"
>;

export function buildSubmissionTiming(startedAt: string | undefined, endedAt = new Date()) {
  const startedAtDate = startedAt ? new Date(startedAt) : endedAt;
  const durationMs = endedAt.getTime() - startedAtDate.getTime();
  if (
    !Number.isFinite(startedAtDate.getTime()) ||
    durationMs < 0 ||
    durationMs > 30 * 24 * 60 * 60 * 1_000
  ) {
    return null;
  }
  return {
    session_started_at: startedAtDate.toISOString(),
    session_ended_at: endedAt.toISOString(),
    time_taken_seconds: Math.floor(durationMs / 1_000),
  };
}

export function summarizeAttemptHistory(rows: AttemptSummaryRow[]) {
  const problems = new Map<string, {
    problem_title: string;
    difficulty: SubmissionRecord["difficulty"];
    problem_tags: string[];
    accepted: boolean;
  }>();
  const verdictCounts = new Map<string, number>();

  for (const row of rows) {
    verdictCounts.set(row.verdict, (verdictCounts.get(row.verdict) ?? 0) + 1);
    const problem = problems.get(row.problem_slug);
    if (problem) {
      if (row.verdict === "Accepted") problem.accepted = true;
      continue;
    }
    problems.set(row.problem_slug, {
      problem_title: row.problem_title,
      difficulty: row.difficulty,
      problem_tags: row.problem_tags,
      accepted: row.verdict === "Accepted",
    });
  }

  const difficultyAttempted: Record<SubmissionRecord["difficulty"], number> = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
  };
  const difficultySolved: Record<SubmissionRecord["difficulty"], number> = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
  };
  const focusAreas = new Map<string, number>();
  for (const problem of problems.values()) {
    difficultyAttempted[problem.difficulty] += 1;
    if (problem.accepted) {
      difficultySolved[problem.difficulty] += 1;
    } else {
      for (const tag of new Set(problem.problem_tags)) {
        focusAreas.set(tag, (focusAreas.get(tag) ?? 0) + 1);
      }
    }
  }

  const attemptedQuestions = problems.size;
  const solvedQuestions = [...problems.values()].filter(({ accepted }) => accepted).length;
  return {
    total_attempts: rows.length,
    attempted_questions: attemptedQuestions,
    total_solved: solvedQuestions,
    question_success_rate: attemptedQuestions === 0
      ? 0
      : Math.round((solvedQuestions / attemptedQuestions) * 100),
    verdict_counts: Object.fromEntries(verdictCounts),
    difficulty_attempted: difficultyAttempted,
    difficulty_solved: difficultySolved,
    focus_areas: [...focusAreas.entries()]
      .map(([tag, questions]) => ({ tag, questions }))
      .sort((left, right) => right.questions - left.questions || left.tag.localeCompare(right.tag)),
  };
}

function throwDatabaseError(error: { code?: string; message: string }): never {
  if (isMissingStorageError(error, "astra_submissions")) {
    throw new RequiredStorageError("Submission");
  }
  throw error;
}

export async function recordSubmission(
  session: SessionClaims,
  submission: Omit<SubmissionRecord, "id" | "created_at">,
) {
  const { error } = await getSupabaseAdmin()
    .from("astra_submissions")
    .insert({
      account_type: session.accountType,
      user_id: session.userId,
      ...submission,
    });
  if (error) throwDatabaseError(error);
}

export async function getSubmissionSummary(session: SessionClaims) {
  const supabase = getSupabaseAdmin();
  const pageSize = 500;
  let offset = 0;
  const attempts: AttemptSummaryRow[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("astra_submissions")
      .select("problem_slug,problem_title,difficulty,problem_tags,verdict")
      .eq("account_type", session.accountType)
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throwDatabaseError(error);

    attempts.push(...((data ?? []).map((row) => ({
      problem_slug: String(row.problem_slug),
      problem_title: String(row.problem_title),
      difficulty: row.difficulty as SubmissionRecord["difficulty"],
      problem_tags: Array.isArray(row.problem_tags) ? row.problem_tags.map(String) : [],
      verdict: String(row.verdict),
    }))));
    if ((data ?? []).length < pageSize) break;
    offset += pageSize;
  }

  const recentResult = await supabase
    .from("astra_submissions")
    .select("id,problem_slug,problem_title,difficulty,problem_tags,language,verdict,failed_test_case,passed_test_cases,total_test_cases,execution_time,memory_kb,session_started_at,session_ended_at,time_taken_seconds,created_at")
    .eq("account_type", session.accountType)
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentResult.error) throwDatabaseError(recentResult.error);

  const attemptSummary = summarizeAttemptHistory(attempts);
  const tagCounts = new Map<string, number>();
  const acceptedProblemTags = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    if (attempt.verdict !== "Accepted") continue;
    if (!acceptedProblemTags.has(attempt.problem_slug)) acceptedProblemTags.set(attempt.problem_slug, new Set());
    for (const tag of attempt.problem_tags) acceptedProblemTags.get(attempt.problem_slug)?.add(tag);
  }
  for (const tags of acceptedProblemTags.values()) {
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  return {
    ...attemptSummary,
    skill_tags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag)),
    recent_submissions: (recentResult.data ?? []).map((row) => ({
      ...row,
      source_code: null,
      diagnostic: null,
    })) as SubmissionRecord[],
  };
}
