import { Router } from "express";
import { env } from "../config/env.js";
import { buildLeaderboard, leaderboardLimit, type LeaderboardSubmission } from "../lib/leaderboard.js";
import { isMissingStorageError, RequiredStorageError } from "../lib/storage-errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const leaderboardRouter = Router();

const pageSize = 500;
const lookupBatchSize = 100;

function storageError(error: { code?: string; message: string }) {
  if (isMissingStorageError(error, "astra_submissions")) {
    return new RequiredStorageError("Submission");
  }
  return error;
}

function displayName(firstName: unknown, lastName: unknown) {
  const name = [firstName, lastName]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .map((part) => part.trim())
    .join(" ");
  return name || null;
}

function recordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      row !== null && typeof row === "object" && !Array.isArray(row),
  );
}

async function loadDisplayNames(submissions: LeaderboardSubmission[]) {
  const names = new Map<string, string>();
  const memberIds = [...new Set(
    submissions.filter(({ account_type }) => account_type === "member").map(({ user_id }) => user_id),
  )];
  const outsiderIds = [...new Set(
    submissions.filter(({ account_type }) => account_type === "outsider").map(({ user_id }) => user_id),
  )];
  const supabase = getSupabaseAdmin();

  for (let offset = 0; offset < outsiderIds.length; offset += lookupBatchSize) {
    const ids = outsiderIds.slice(offset, offset + lookupBatchSize);
    const { data, error } = await supabase
      .from("astra_credentials")
      .select("id,first_name,last_name")
      .in("id", ids);
    if (error) throw error;
    for (const profile of data ?? []) {
      const name = displayName(profile.first_name, profile.last_name);
      if (name) names.set(`outsider:${profile.id}`, name);
    }
  }

  for (let offset = 0; offset < memberIds.length; offset += lookupBatchSize) {
    const ids = memberIds.slice(offset, offset + lookupBatchSize);
    const { data: accounts, error: accountsError } = await supabase
      .from(env.MEMBER_USER_TABLE)
      .select(`${env.MEMBER_USER_PK_COLUMN},${env.MEMBER_LOGIN_ID_COLUMN}`)
      .in(env.MEMBER_USER_PK_COLUMN, ids);
    if (accountsError) throw accountsError;

    const accountSocietyIds = new Map<string, string>();
    for (const account of recordRows(accounts)) {
      const userId = account[env.MEMBER_USER_PK_COLUMN];
      const societyId = account[env.MEMBER_LOGIN_ID_COLUMN];
      if (userId !== null && userId !== undefined && societyId !== null && societyId !== undefined) {
        accountSocietyIds.set(String(userId), String(societyId));
      }
    }
    const societyIds = [...new Set(accountSocietyIds.values())];

    for (let profileOffset = 0; profileOffset < societyIds.length; profileOffset += lookupBatchSize) {
      const profileIds = societyIds.slice(profileOffset, profileOffset + lookupBatchSize);
      const { data: profiles, error: profilesError } = await supabase
        .from(env.MEMBER_PROFILE_TABLE)
        .select("*")
        .in(env.MEMBER_PROFILE_ID_COLUMN, profileIds);
      if (profilesError) throw profilesError;

      const profileNames = new Map<string, string>();
      for (const profile of recordRows(profiles)) {
        const societyId = profile[env.MEMBER_PROFILE_ID_COLUMN];
        const name = displayName(profile.first_name, profile.last_name);
        if (societyId !== null && societyId !== undefined && name) {
          profileNames.set(String(societyId), name);
        }
      }
      for (const [userId, societyId] of accountSocietyIds) {
        const name = profileNames.get(societyId);
        if (name) names.set(`member:${userId}`, name);
      }
    }
  }

  return names;
}

leaderboardRouter.get("/", async (_request, response, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const submissions: LeaderboardSubmission[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("astra_submissions")
        .select("account_type,user_id,problem_slug,difficulty")
        .eq("verdict", "Accepted")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw storageError(error);

      submissions.push(...(data ?? []).map((row) => ({
        account_type: row.account_type as LeaderboardSubmission["account_type"],
        user_id: String(row.user_id),
        problem_slug: String(row.problem_slug),
        difficulty: row.difficulty as LeaderboardSubmission["difficulty"],
      })));
      if ((data ?? []).length < pageSize) break;
      offset += pageSize;
    }

    const names = await loadDisplayNames(submissions);
    const entries = buildLeaderboard(submissions, names, Number.MAX_SAFE_INTEGER);
    response.json({
      entries: entries.slice(0, leaderboardLimit),
      total_entries: entries.length,
    });
  } catch (error) {
    next(error);
  }
});
