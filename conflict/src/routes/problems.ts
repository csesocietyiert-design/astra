import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import { isMissingStorageError, RequiredStorageError } from "../lib/storage-errors.js";
import type { SessionClaims } from "../lib/session.js";
import { adminAccountId, isAdminAccount } from "../lib/admin.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const problemRouter = Router();

const builtInSlugs = new Set([
  "two-sum",
  "longest-substring-without-repeating-characters",
  "median-of-two-sorted-arrays",
  "valid-parentheses",
  "merge-intervals",
  "word-ladder",
]);

const testCaseSchema = z.object({
  input: z.string().max(10_000),
  expected: z.string().max(10_000),
  is_public: z.boolean().default(false),
});

export const problemQuestionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  topic: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
  description: z.string().trim().min(10).max(4_000),
  input_format: z.string().trim().min(1).max(2_000),
  output_format: z.string().trim().min(1).max(2_000),
  constraints: z.string().trim().min(1).max(2_000),
  sample_input: z.string().max(10_000),
  sample_output: z.string().max(10_000),
  starter_code: z.string().max(30_000).default(""),
  supported_languages: z.array(z.number().int().positive()).max(40).default([]),
  starter_codes: z.record(z.string(), z.string().max(30_000)).default({}),
  time_limit_ms: z.number().int().min(100).max(30_000).default(2_000),
  memory_limit_mb: z.number().int().min(16).max(1_024).default(256),
  test_cases: z.array(testCaseSchema).min(1).max(25),
});

const createProblemsSchema = z.object({
  questions: z.array(problemQuestionSchema).min(1).max(25),
});

const draftSchema = z.object({
  draft_id: z.string().uuid().optional(),
  problem_id: z.string().trim().min(1).max(80).nullable().optional(),
  draft_data: z.record(z.string(), z.unknown()),
});

function problemSlug(title: string) {
  const slug = title.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || `question-${randomUUID().slice(0, 8)}`;
}

function publicProblem(row: Record<string, unknown>) {
  const cases = Array.isArray(row.test_cases) ? row.test_cases : [];
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    id: String(row.problem_id),
    title: String(row.title),
    slug: String(row.slug),
    difficulty: row.difficulty,
    tags,
    status: "Unsolved" as const,
    acceptance: 0,
    description: typeof row.description === "string" ? row.description : "",
    topic: typeof row.topic === "string" ? row.topic : "",
    inputFormat: typeof row.input_format === "string" ? row.input_format : "",
    outputFormat: typeof row.output_format === "string" ? row.output_format : "",
    constraints: typeof row.constraints === "string" ? row.constraints : "",
    sampleInput: typeof row.sample_input === "string" ? row.sample_input : "",
    sampleOutput: typeof row.sample_output === "string" ? row.sample_output : "",
    publicTestCases: cases.flatMap((testCase) => {
      if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) return [];
      const item = testCase as Record<string, unknown>;
      return item.is_public === true &&
        typeof item.input === "string" &&
        typeof item.expected === "string"
        ? [{ input: item.input, expected: item.expected }]
        : [];
    }),
    starterCode: String(row.starter_code ?? ""),
    testCaseCount: cases.length,
    supportedLanguages: Array.isArray(row.supported_languages)
      ? row.supported_languages.filter((language): language is number => typeof language === "number")
      : [],
    starterCodes: row.starter_codes && typeof row.starter_codes === "object" && !Array.isArray(row.starter_codes)
      ? row.starter_codes
      : {},
    timeLimitMs: typeof row.time_limit_ms === "number" ? row.time_limit_ms : 2_000,
    memoryLimitMb: typeof row.memory_limit_mb === "number" ? row.memory_limit_mb : 256,
  };
}

function storageError(error: { code?: string; message: string }) {
  if (
    isMissingStorageError(error, "astra_problems") ||
    isMissingStorageError(error, "astra_problem_drafts")
  ) {
    return new RequiredStorageError("Problem");
  }
  return error;
}

function requireAdmin(request: Request, response: Response): SessionClaims | null {
  const session = request.astraSession;
  if (!session) {
    response.status(401).json({ error: "Please sign in to continue." });
    return null;
  }
  if (!isAdminAccount(session)) {
    response.status(403).json({ error: "You do not have permission to manage questions." });
    return null;
  }
  return session;
}

const publicProblemColumns = "problem_id,title,slug,difficulty,tags,topic,description,input_format,output_format,constraints,sample_input,sample_output,starter_code,test_cases,supported_languages,starter_codes,time_limit_ms,memory_limit_mb";
const editableProblemColumns = `${publicProblemColumns},publication_status,created_by,created_at`;

problemRouter.get("/", async (_request, response, next) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("astra_problems")
      .select(publicProblemColumns)
      .eq("publication_status", "published")
      .order("created_at", { ascending: false });
    if (error) throw storageError(error);
    response.json({ problems: (data ?? []).map((row) => publicProblem(row)) });
  } catch (error) {
    next(error);
  }
});

problemRouter.get("/manage", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const supabase = getSupabaseAdmin();
    const [problemsResult, draftsResult] = await Promise.all([
      supabase.from("astra_problems").select(editableProblemColumns).order("created_at", { ascending: false }),
      supabase.from("astra_problem_drafts")
        .select("draft_id,problem_id,title,draft_data,created_at,updated_at")
        .eq("created_by", adminAccountId(session))
        .order("updated_at", { ascending: false }),
    ]);
    if (problemsResult.error) throw storageError(problemsResult.error);
    if (draftsResult.error) throw storageError(draftsResult.error);
    response.json({
      problems: (problemsResult.data ?? []).map((row) => ({
        ...publicProblem(row),
        testCases: Array.isArray(row.test_cases) ? row.test_cases : [],
        publicationStatus: row.publication_status,
      })),
      drafts: draftsResult.data ?? [],
    });
  } catch (error) {
    next(error);
  }
});

problemRouter.get("/:slug", async (request, response, next) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("astra_problems")
      .select(publicProblemColumns)
      .eq("slug", request.params.slug)
      .eq("publication_status", "published")
      .maybeSingle();
    if (error) throw storageError(error);
    if (!data) {
      response.status(404).json({ error: "Question not found." });
      return;
    }
    response.json({ problem: publicProblem(data) });
  } catch (error) {
    next(error);
  }
});

problemRouter.post("/", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;

  const parsed = createProblemsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "One or more questions are invalid. Check every required field and test case.",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const slugs = parsed.data.questions.map(({ title }) => problemSlug(title));
  const usedSlugs = new Set(builtInSlugs);
  for (const slug of slugs) {
    if (usedSlugs.has(slug)) {
      response.status(409).json({
        error: "Question titles must generate unique slugs and cannot reuse a built-in question URL.",
      });
      return;
    }
    usedSlugs.add(slug);
  }

  const rows = parsed.data.questions.map((question, index) => {
    const problemId = randomUUID();
    return {
      problem_id: `AST-${problemId.slice(0, 8).toUpperCase()}`,
      slug: slugs[index],
      ...question,
      created_by: adminAccountId(session),
    };
  });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("astra_problems")
      .insert(rows)
      .select(publicProblemColumns);
    if (error) {
      if (error.code === "23505") {
        response.status(409).json({
          error: "A question with the same title or generated slug already exists. Change the title and try again.",
        });
        return;
      }
      throw storageError(error);
    }
    response.status(201).json({ problems: (data ?? []).map((row) => publicProblem(row)) });
  } catch (error) {
    next(error);
  }
});

problemRouter.post("/drafts", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  const parsed = draftSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Provide valid draft data." });
    return;
  }
  try {
    const supabase = getSupabaseAdmin();
    const owner = adminAccountId(session);
    const values = {
      problem_id: parsed.data.problem_id ?? null,
      title: typeof parsed.data.draft_data.title === "string"
        ? parsed.data.draft_data.title.slice(0, 120)
        : "",
      draft_data: parsed.data.draft_data,
      created_by: owner,
      updated_at: new Date().toISOString(),
    };
    const result = parsed.data.draft_id
      ? await supabase.from("astra_problem_drafts")
        .update(values)
        .eq("draft_id", parsed.data.draft_id)
        .eq("created_by", owner)
        .select("draft_id,problem_id,title,draft_data,created_at,updated_at")
        .maybeSingle()
      : await supabase.from("astra_problem_drafts")
        .insert(values)
        .select("draft_id,problem_id,title,draft_data,created_at,updated_at")
        .single();
    if (result.error) throw storageError(result.error);
    if (!result.data) {
      response.status(404).json({ error: "Question draft not found." });
      return;
    }
    response.status(parsed.data.draft_id ? 200 : 201).json({ draft: result.data });
  } catch (error) {
    next(error);
  }
});

problemRouter.post("/drafts/:draftId/publish", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const supabase = getSupabaseAdmin();
    const owner = adminAccountId(session);
    const { data: draft, error: draftError } = await supabase.from("astra_problem_drafts")
      .select("draft_id,problem_id,draft_data")
      .eq("draft_id", request.params.draftId)
      .eq("created_by", owner)
      .maybeSingle();
    if (draftError) throw storageError(draftError);
    if (!draft) {
      response.status(404).json({ error: "Question draft not found." });
      return;
    }

    let existing: Record<string, unknown> = {};
    if (draft.problem_id) {
      const { data, error } = await supabase.from("astra_problems")
        .select("*")
        .eq("problem_id", draft.problem_id)
        .maybeSingle();
      if (error) throw storageError(error);
      if (!data) {
        response.status(404).json({ error: "The question attached to this draft no longer exists." });
        return;
      }
      existing = data as Record<string, unknown>;
    }
    const candidate = {
      title: existing.title,
      difficulty: existing.difficulty,
      topic: existing.topic,
      tags: existing.tags,
      description: existing.description,
      input_format: existing.input_format,
      output_format: existing.output_format,
      constraints: existing.constraints,
      sample_input: existing.sample_input,
      sample_output: existing.sample_output,
      starter_code: existing.starter_code,
      supported_languages: existing.supported_languages ?? [],
      starter_codes: existing.starter_codes ?? {},
      time_limit_ms: existing.time_limit_ms ?? 2_000,
      memory_limit_mb: existing.memory_limit_mb ?? 256,
      test_cases: existing.test_cases,
      ...(draft.draft_data as Record<string, unknown>),
    };
    const parsed = problemQuestionSchema.safeParse(candidate);
    if (!parsed.success) {
      response.status(400).json({
        error: "This draft is not ready to publish. Complete the required question and judging fields.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const slug = typeof existing.slug === "string" ? existing.slug : problemSlug(parsed.data.title);
    if (!existing.slug && builtInSlugs.has(slug)) {
      response.status(409).json({ error: "This title conflicts with a built-in question URL." });
      return;
    }
    const values = { ...parsed.data, slug, publication_status: "published" };
    const result = draft.problem_id
      ? await supabase.from("astra_problems").update(values)
        .eq("problem_id", draft.problem_id).select(publicProblemColumns).single()
      : await supabase.from("astra_problems").insert({
        problem_id: `AST-${randomUUID().slice(0, 8).toUpperCase()}`,
        ...values,
        created_by: owner,
      }).select(publicProblemColumns).single();
    if (result.error) {
      if (result.error.code === "23505") {
        response.status(409).json({ error: "A question with this title or URL already exists." });
        return;
      }
      throw storageError(result.error);
    }

    const { error: deleteError } = await supabase.from("astra_problem_drafts")
      .delete()
      .eq("draft_id", draft.draft_id)
      .eq("created_by", owner);
    if (deleteError) throw storageError(deleteError);
    response.json({ problem: publicProblem(result.data) });
  } catch (error) {
    next(error);
  }
});

problemRouter.delete("/drafts/:draftId", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const { data, error } = await getSupabaseAdmin().from("astra_problem_drafts")
      .delete()
      .eq("draft_id", request.params.draftId)
      .eq("created_by", adminAccountId(session))
      .select("draft_id")
      .maybeSingle();
    if (error) throw storageError(error);
    if (!data) {
      response.status(404).json({ error: "Question draft not found." });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

problemRouter.patch("/:slug/archive", requireSession, async (request, response, next) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const archived = request.body?.archived !== false;
    const { data, error } = await getSupabaseAdmin().from("astra_problems")
      .update({ publication_status: archived ? "archived" : "published" })
      .eq("slug", request.params.slug)
      .select("problem_id,publication_status")
      .maybeSingle();
    if (error) throw storageError(error);
    if (!data) {
      response.status(404).json({ error: "Question not found." });
      return;
    }
    response.json({ problem_id: data.problem_id, publication_status: data.publication_status });
  } catch (error) {
    next(error);
  }
});
