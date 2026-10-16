import { env } from "../config/env.js";

const maxPollAttempts = 10;
const pollDelaysMs = [500, 750, 1_125, 1_688, 2_531, 3_797, 4_000, 4_000, 4_000];
const languageCacheDurationMs = 5 * 60 * 1000;

export class Judge0ServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "Judge0ServiceError";
  }
}

export type Judge0ExecutionResult = {
  status_id: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
};

export type Judge0Language = {
  id: number;
  name: string;
};

export function outputMatches(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n$/, "");
  return normalize(actual) === normalize(expected);
}

type Judge0Response = {
  token?: unknown;
  status?: { id?: unknown; description?: unknown };
  stdout?: unknown;
  stderr?: unknown;
  compile_output?: unknown;
  time?: unknown;
  memory?: unknown;
  exit_code?: unknown;
};

type SupportedLanguageFamily = "c" | "cpp" | "java" | "javascript" | "python";

function languageFamily(name: string): SupportedLanguageFamily | null {
  const normalized = name.trim().toLowerCase();
  if (/^c(?:\s*\(|$)/.test(normalized)) return "c";
  if (/^c\+\+/.test(normalized)) return "cpp";
  if (/^java(?:\s|\(|$)/.test(normalized)) return "java";
  if (/^(?:javascript|node\.js)(?:\s|\(|$)/.test(normalized)) return "javascript";
  if (/^python(?:\s|\(|$)/.test(normalized) && !/^python\s*\(2(?:[.)]|\.)/.test(normalized)) {
    return "python";
  }
  return null;
}

let cachedLanguages: { expiresAt: number; languages: Judge0Language[] } | null = null;
let languageRequest: Promise<Judge0Language[]> | null = null;

export async function getSupportedLanguages(): Promise<Judge0Language[]> {
  if (cachedLanguages && cachedLanguages.expiresAt > Date.now()) return cachedLanguages.languages;
  if (languageRequest) return languageRequest;

  languageRequest = (async () => {
    const baseUrl = judge0BaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let result: unknown;
    try {
      result = await requestJudge0(`${baseUrl}/languages`, {
        headers: judge0Headers(baseUrl),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!Array.isArray(result)) {
      throw new Judge0ServiceError("Judge0 returned an invalid language list.", 502);
    }
    const languages = result.flatMap((entry): Judge0Language[] => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("id" in entry) ||
        !("name" in entry) ||
        typeof entry.id !== "number" ||
        !Number.isInteger(entry.id) ||
        typeof entry.name !== "string" ||
        !languageFamily(entry.name)
      ) {
        return [];
      }
      return [{ id: entry.id, name: entry.name }];
    });
    if (languages.length === 0) {
      throw new Judge0ServiceError("Judge0 does not report any supported programming languages.", 503);
    }
    cachedLanguages = { expiresAt: Date.now() + languageCacheDurationMs, languages };
    return languages;
  })();

  try {
    return await languageRequest;
  } finally {
    languageRequest = null;
  }
}

export async function getJudge0Language(language: string | number): Promise<Judge0Language> {
  const languages = await getSupportedLanguages();
  const normalized = String(language).trim().toLowerCase().replace(/\s+/g, " ");
  const numericId = /^\d+$/.test(normalized) ? Number(normalized) : null;
  const byId = numericId === null ? undefined : languages.find(({ id }) => id === numericId);
  if (byId) return byId;

  const exact = languages.find(({ name }) => name.trim().toLowerCase().replace(/\s+/g, " ") === normalized);
  if (exact) return exact;

  const family = languageFamily(normalized);
  const byFamily = family ? languages.find(({ name }) => languageFamily(name) === family) : undefined;
  if (byFamily) return byFamily;
  throw new Judge0ServiceError("Choose a language supported by the configured code runner.", 400);
}

export function encodeJudge0Text(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function decodeJudge0Text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Judge0ServiceError("Judge0 returned invalid encoded output.", 502);
  }
  return Buffer.from(value, "base64").toString("utf8");
}

function judge0BaseUrl() {
  if (!env.JUDGE0_API_URL) {
    throw new Judge0ServiceError(
      "Code execution is not configured. Set JUDGE0_API_URL in the backend environment.",
      503,
    );
  }
  return env.JUDGE0_API_URL.replace(/\/+$/, "");
}

function judge0Headers(baseUrl: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const hostname = new URL(baseUrl).hostname;
  if (env.JUDGE0_API_KEY) {
    headers.set(env.JUDGE0_AUTH_HEADER || "X-Auth-Token", env.JUDGE0_API_KEY);
  }
  if (hostname.endsWith(".rapidapi.com")) {
    headers.set("X-RapidAPI-Host", hostname);
  }
  return headers;
}

async function requestJudge0(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    if (init.signal?.aborted) {
      throw new Judge0ServiceError("Code execution timed out. Try again.", 504);
    }
    throw new Judge0ServiceError("Could not connect to Judge0. Check the backend endpoint.", 502);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Judge0ServiceError("Judge0 is rate-limiting requests. Try again shortly.", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Judge0ServiceError("Judge0 rejected its configured credentials. Check the backend settings.", 503);
    }
    if (response.status >= 500) {
      throw new Judge0ServiceError("Judge0 is temporarily unavailable. Try again shortly.", 502);
    }
    throw new Judge0ServiceError("Judge0 rejected the execution request.", 400);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new Judge0ServiceError("Judge0 returned an invalid response.", 502);
  }
}

function normalizeResult(value: unknown): Judge0ExecutionResult {
  if (typeof value !== "object" || value === null) {
    throw new Judge0ServiceError("Judge0 returned an invalid execution result.", 502);
  }
  const result = value as Judge0Response;
  const statusId = result.status?.id;
  const status = result.status?.description;
  if (typeof statusId !== "number" || typeof status !== "string") {
    throw new Judge0ServiceError("Judge0 returned an invalid execution status.", 502);
  }
  if (statusId === 1 || statusId === 2) {
    throw new Judge0ServiceError("Judge0 execution did not finish before the polling limit.", 504);
  }
  if (/^(?:internal|system|judge) error$/i.test(status)) {
    throw new Judge0ServiceError("Judge0 encountered an infrastructure error. Try again shortly.", 502);
  }
  return {
    status_id: statusId,
    status,
    stdout: decodeJudge0Text(result.stdout),
    stderr: decodeJudge0Text(result.stderr),
    compile_output: decodeJudge0Text(result.compile_output),
    time: typeof result.time === "string" ? result.time : null,
    memory: typeof result.memory === "number" ? result.memory : null,
    exit_code: typeof result.exit_code === "number" ? result.exit_code : null,
  };
}

export async function submitCode(input: {
  language: string | number;
  sourceCode: string;
  stdin: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  signal: AbortSignal;
}): Promise<string> {
  const baseUrl = judge0BaseUrl();
  const language = await getJudge0Language(input.language);
  const result = await requestJudge0(
    `${baseUrl}/submissions?base64_encoded=true&wait=false`,
    {
      method: "POST",
      headers: judge0Headers(baseUrl),
      signal: input.signal,
      body: JSON.stringify({
        language_id: language.id,
        source_code: encodeJudge0Text(input.sourceCode),
        stdin: encodeJudge0Text(input.stdin),
        ...(input.timeLimitMs === undefined ? {} : { cpu_time_limit: input.timeLimitMs / 1_000 }),
        ...(input.memoryLimitMb === undefined ? {} : { memory_limit: input.memoryLimitMb * 1_024 }),
      }),
    },
  );
  if (
    typeof result !== "object" ||
    result === null ||
    !("token" in result) ||
    typeof result.token !== "string" ||
    result.token.length === 0
  ) {
    throw new Judge0ServiceError("Judge0 did not return an execution token.", 502);
  }
  return result.token;
}

export async function pollExecution(
  token: string,
  signal: AbortSignal,
): Promise<Judge0ExecutionResult> {
  const baseUrl = judge0BaseUrl();
  const headers = judge0Headers(baseUrl);

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollDelaysMs[attempt] ?? 4_000));
    const result = await requestJudge0(
      `${baseUrl}/submissions/${encodeURIComponent(token)}?base64_encoded=true`,
      { headers, signal },
    );
    const statusId = typeof result === "object" && result !== null && "status" in result
      && typeof result.status === "object" && result.status !== null && "id" in result.status
      ? result.status.id
      : undefined;
    if (typeof statusId !== "number" || (statusId !== 1 && statusId !== 2)) {
      return normalizeResult(result);
    }
  }

  throw new Judge0ServiceError("Judge0 execution did not finish before the polling limit.", 504);
}

export async function executeCode(input: {
  language: string | number;
  sourceCode: string;
  stdin: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  signal: AbortSignal;
}): Promise<Judge0ExecutionResult> {
  const token = await submitCode(input);
  return pollExecution(token, input.signal);
}
