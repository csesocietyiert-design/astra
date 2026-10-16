import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  executeCode,
  getJudge0Language,
  getSupportedLanguages,
  Judge0ServiceError,
  outputMatches,
} from "../services/judge0Service.js";
import { requireSession } from "../middleware/require-session.js";
import { getCurrentStreak } from "../lib/streak.js";
import { buildSubmissionTiming, recordSubmission } from "../lib/submissions.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { isMissingStorageError, RequiredStorageError } from "../lib/storage-errors.js";

export const judgeRouter = Router();

const executeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const executeSchema = z.object({
  language_id: z.union([
    z.string().trim().min(1).max(40),
    z.number().int(),
  ]),
  source_code: z.string().min(1).max(30_000).refine((source) => source.trim().length > 0),
  stdin: z.string().max(10_000).default(""),
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const submitSchema = z.object({
  problem_slug: z.string().trim().min(1).max(80),
  language_id: z.union([
    z.string().trim().min(1).max(40),
    z.number().int(),
  ]),
  source_code: z.string().min(1).max(30_000).refine((source) => source.trim().length > 0),
  session_started_at: z.string().datetime({ offset: true }).optional(),
});

const legacyProblemSlug = "longest-substring-without-repeating-characters";
const legacyProblem = {
  test_cases: [
    { input: "abcabcbb\n", expected: "3" },
    { input: "bbbbb\n", expected: "1" },
    { input: "pwwkew\n", expected: "3" },
    { input: "abba\n", expected: "2" },
    { input: "dvdf\n", expected: "3" },
    { input: "\n", expected: "0" },
  ],
  problem_slug: "longest-substring-without-repeating-characters",
  problem_title: "Longest Substring Without Repeating Characters",
  difficulty: "Medium" as const,
  problem_tags: ["strings", "sliding-window"],
  supported_languages: [] as number[],
  time_limit_ms: 2_000,
  memory_limit_mb: 256,
};

const storedTestCasesSchema = z.array(z.object({
  input: z.string().max(10_000),
  expected: z.string().max(10_000),
  is_public: z.boolean().optional().default(false),
})).min(1).max(25);

async function getProblemForSubmission(slug: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("astra_problems")
    .select("problem_id,title,slug,difficulty,tags,test_cases,supported_languages,time_limit_ms,memory_limit_mb")
    .eq("slug", slug)
    .eq("publication_status", "published")
    .maybeSingle();
  if (error) {
    if (isMissingStorageError(error, "astra_problems")) {
      if (slug === legacyProblemSlug) return legacyProblem;
      throw new RequiredStorageError("Problem");
    }
    throw error;
  }

  if (!data) return slug === legacyProblemSlug ? legacyProblem : null;

  const testCases = storedTestCasesSchema.safeParse(data.test_cases);
  if (!testCases.success) {
    throw new Error(`Stored test cases are invalid for problem ${data.problem_id}.`);
  }
  return {
    test_cases: testCases.data,
    problem_slug: String(data.slug),
    problem_title: String(data.title),
    difficulty: data.difficulty as "Easy" | "Medium" | "Hard",
    problem_tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    supported_languages: Array.isArray(data.supported_languages)
      ? data.supported_languages.filter((id): id is number => typeof id === "number")
      : [],
    time_limit_ms: typeof data.time_limit_ms === "number" ? data.time_limit_ms : 2_000,
    memory_limit_mb: typeof data.memory_limit_mb === "number" ? data.memory_limit_mb : 256,
  };
}

judgeRouter.get("/languages", requireSession, async (_request, response, next) => {
  try {
    response.json({ languages: await getSupportedLanguages() });
  } catch (error) {
    next(error);
  }
});

judgeRouter.post("/execute", requireSession, executeLimiter, async (request, response) => {
  const parsed = executeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose a supported language and provide valid code and input." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const result = await executeCode({
      language: parsed.data.language_id,
      sourceCode: parsed.data.source_code,
      stdin: parsed.data.stdin,
      signal: controller.signal,
    });
    response.json(result);
  } catch (error) {
    if (error instanceof Judge0ServiceError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error("Judge0 execution failed:", error);
    response.status(502).json({ error: "Judge0 could not complete this execution request." });
  } finally {
    clearTimeout(timeout);
  }
});

judgeRouter.post("/submit", requireSession, submitLimiter, async (request, response, next) => {
  const parsed = submitSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Submissions are not enabled for this problem yet. Choose a problem with test-case judging.",
    });
    return;
  }

  const session = request.astraSession;
  if (!session) {
    response.status(401).json({ error: "Please sign in to submit a solution." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const sessionEndedAt = new Date();
    const sessionTiming = buildSubmissionTiming(parsed.data.session_started_at, sessionEndedAt);
    if (!sessionTiming) {
      response.status(400).json({ error: "The problem-solving session time is invalid. Refresh the question and try again." });
      return;
    }

    const language = await getJudge0Language(parsed.data.language_id);
    const problem = await getProblemForSubmission(parsed.data.problem_slug);
    if (!problem) {
      response.status(404).json({ error: "This question is not available for judging." });
      return;
    }
    if (
      problem.supported_languages.length > 0 &&
      !problem.supported_languages.includes(language.id)
    ) {
      response.status(400).json({ error: "This question does not support the selected language." });
      return;
    }

    const results: {
      testCase: number;
      expected: string;
      result: Awaited<ReturnType<typeof executeCode>>;
    }[] = [];
    const concurrency = 5;
    for (let offset = 0; offset < problem.test_cases.length; offset += concurrency) {
      const batch = problem.test_cases.slice(offset, offset + concurrency);
      const batchResults = await Promise.all(batch.map(async (testCase, index) => ({
        testCase: offset + index + 1,
        expected: testCase.expected,
        result: await executeCode({
          language: language.id,
          sourceCode: parsed.data.source_code,
          stdin: testCase.input,
          timeLimitMs: problem.time_limit_ms,
          memoryLimitMb: problem.memory_limit_mb,
          signal: controller.signal,
        }),
      })));
      results.push(...batchResults);
      if (batchResults.some(({ result }) => result.status.toLowerCase().includes("compilation error"))) {
        break;
      }
    }

    const passedTestCases = results.filter(({ expected, result }) =>
      result.status === "Accepted" && outputMatches(result.stdout, expected),
    ).length;
    const executionTimes = results
      .map(({ result }) => result.time === null ? null : Number(result.time))
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const memoryUsages = results
      .map(({ result }) => result.memory)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const executionMetrics = {
      source_code: parsed.data.source_code,
      passed_test_cases: passedTestCases,
      total_test_cases: problem.test_cases.length,
      execution_time: executionTimes.length ? Math.max(...executionTimes) : null,
      memory_kb: memoryUsages.length ? Math.max(...memoryUsages) : null,
    };
    const failedCase = results.find(({ expected, result }) =>
      result.status !== "Accepted" ||
      !outputMatches(result.stdout, expected),
    );
    const problemMetadata = {
      problem_slug: problem.problem_slug,
      problem_title: problem.problem_title,
      difficulty: problem.difficulty,
      problem_tags: problem.problem_tags,
    };
    if (failedCase) {
      await recordSubmission(session, {
        ...problemMetadata,
        language: language.name,
        verdict: failedCase.result.status === "Accepted" ? "Wrong Answer" : failedCase.result.status,
        failed_test_case: failedCase.testCase,
        ...executionMetrics,
        ...sessionTiming,
        diagnostic: failedCase.result.compile_output ?? failedCase.result.stderr,
      });
      response.json({
        accepted: false,
        verdict: failedCase.result.status === "Accepted" ? "Wrong Answer" : failedCase.result.status,
        failed_test_case: failedCase.testCase,
        passed_test_cases: passedTestCases,
        total_test_cases: problem.test_cases.length,
        tests_run: results.length,
        ...sessionTiming,
        diagnostic: failedCase.result.status.toLowerCase().includes("compilation error")
          ? failedCase.result.compile_output
          : null,
      });
      return;
    }

    await recordSubmission(session, {
      ...problemMetadata,
      language: language.name,
      verdict: "Accepted",
      failed_test_case: null,
      ...executionMetrics,
      ...sessionTiming,
      diagnostic: null,
    });
    const streak = await getCurrentStreak(session);
    response.json({
      accepted: true,
      verdict: "Accepted",
      passed_test_cases: passedTestCases,
      total_test_cases: problem.test_cases.length,
      tests_run: results.length,
      ...sessionTiming,
      ...streak,
    });
  } catch (error) {
    if (error instanceof Judge0ServiceError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  } finally {
    clearTimeout(timeout);
  }
});
