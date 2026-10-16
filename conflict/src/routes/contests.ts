import { Router } from "express";
import { z } from "zod";
import { getContestStatus } from "../lib/contests.js";
import { getSession } from "../lib/session.js";
import { isMissingStorageError, RequiredStorageError } from "../lib/storage-errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { requireSession } from "../middleware/require-session.js";

export const contestRouter = Router();

const contestIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function storageError(error: { code?: string; message: string }) {
  if (
    isMissingStorageError(error, "astra_contests") ||
    isMissingStorageError(error, "astra_contest_registrations")
  ) {
    return new RequiredStorageError("Contest");
  }
  return error;
}

contestRouter.get("/", async (request, response, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: contests, error: contestsError } = await supabase
      .from("astra_contests")
      .select("contest_id,title,description,starts_at,duration_minutes,registration_open")
      .order("starts_at", { ascending: true });
    if (contestsError) throw storageError(contestsError);

    const contestIds = (contests ?? []).map(({ contest_id }) => String(contest_id));
    const session = await getSession(request);
    const registrationCounts = new Map<string, number>();
    let registeredIds = new Set<string>();

    if (contestIds.length) {
      for (const contestId of contestIds) {
        const { count, error: countError } = await supabase
          .from("astra_contest_registrations")
          .select("contest_id", { count: "exact", head: true })
          .eq("contest_id", contestId);
        if (countError) throw storageError(countError);
        registrationCounts.set(contestId, count ?? 0);
      }

      if (session) {
        const { data: ownRegistrations, error: ownRegistrationsError } = await supabase
          .from("astra_contest_registrations")
          .select("contest_id")
          .eq("account_type", session.accountType)
          .eq("user_id", session.userId)
          .in("contest_id", contestIds);
        if (ownRegistrationsError) throw storageError(ownRegistrationsError);
        registeredIds = new Set((ownRegistrations ?? []).map(({ contest_id }) => String(contest_id)));
      }
    }

    const now = Date.now();
    response.json({
      contests: (contests ?? []).map((contest) => {
        const startsAt = String(contest.starts_at);
        const durationMinutes = Number(contest.duration_minutes);
        const { endsAt, status, registrationOpen } = getContestStatus(startsAt, durationMinutes, now);
        return {
          id: String(contest.contest_id),
          title: String(contest.title),
          description: String(contest.description ?? ""),
          starts_at: startsAt,
          duration_minutes: durationMinutes,
          ends_at: endsAt,
          status,
          registration_open: contest.registration_open === true && registrationOpen,
          registration_count: registrationCounts.get(String(contest.contest_id)) ?? 0,
          is_registered: registeredIds.has(String(contest.contest_id)),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

contestRouter.post("/:contestId/register", requireSession, async (request, response, next) => {
  const parsedId = contestIdSchema.safeParse(request.params.contestId);
  if (!parsedId.success) {
    response.status(400).json({ error: "The contest ID is invalid." });
    return;
  }
  const session = request.astraSession;
  if (!session) {
    response.status(401).json({ error: "Please sign in to register." });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: contest, error: contestError } = await supabase
      .from("astra_contests")
      .select("starts_at,registration_open")
      .eq("contest_id", parsedId.data)
      .maybeSingle();
    if (contestError) throw storageError(contestError);
    if (!contest) {
      response.status(404).json({ error: "Contest not found." });
      return;
    }
    if (contest.registration_open !== true || Date.parse(String(contest.starts_at)) <= Date.now()) {
      response.status(409).json({ error: "Registration for this contest is closed." });
      return;
    }

    const { error: registrationError } = await supabase
      .from("astra_contest_registrations")
      .upsert({
        contest_id: parsedId.data,
        account_type: session.accountType,
        user_id: session.userId,
      }, { onConflict: "contest_id,account_type,user_id", ignoreDuplicates: true });
    if (registrationError) throw storageError(registrationError);
    response.status(201).json({ registered: true });
  } catch (error) {
    next(error);
  }
});

contestRouter.delete("/:contestId/register", requireSession, async (request, response, next) => {
  const parsedId = contestIdSchema.safeParse(request.params.contestId);
  if (!parsedId.success) {
    response.status(400).json({ error: "The contest ID is invalid." });
    return;
  }
  const session = request.astraSession;
  if (!session) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: contest, error: contestError } = await supabase
      .from("astra_contests")
      .select("starts_at,registration_open")
      .eq("contest_id", parsedId.data)
      .maybeSingle();
    if (contestError) throw storageError(contestError);
    if (!contest) {
      response.status(404).json({ error: "Contest not found." });
      return;
    }
    if (contest.registration_open !== true || Date.parse(String(contest.starts_at)) <= Date.now()) {
      response.status(409).json({ error: "Registration for this contest is closed." });
      return;
    }

    const { error } = await supabase
      .from("astra_contest_registrations")
      .delete()
      .eq("contest_id", parsedId.data)
      .eq("account_type", session.accountType)
      .eq("user_id", session.userId);
    if (error) throw storageError(error);
    response.json({ registered: false });
  } catch (error) {
    next(error);
  }
});
