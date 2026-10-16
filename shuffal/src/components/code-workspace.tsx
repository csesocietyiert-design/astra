"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Clock3, CloudUpload, FlaskConical, Play, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/api";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="problem-editor-loading">Loading editor…</div>,
});

type ExecutionResult = {
  status_id: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
};

type SubmissionResult = {
  accepted: boolean;
  verdict: string;
  failed_test_case?: number;
  passed_test_cases?: number;
  total_test_cases?: number;
  tests_run?: number;
  diagnostic?: string | null;
  current_streak?: number;
  session_started_at?: string;
  session_ended_at?: string;
  time_taken_seconds?: number;
};

type SupportedLanguage = {
  id: number;
  name: string;
};

type TestCase = {
  label: string;
  input: string;
  expected: string;
  isSample: boolean;
};

const pythonStarter = `def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
`;

const noSupportedLanguages: number[] = [];
const noStarterCodes: Record<string, string> = {};

function languageFamily(name: string) {
  const normalized = name.trim().toLowerCase();
  if (/^c(?:\s*\(|$)/.test(normalized)) return "c";
  if (/^c\+\+/.test(normalized)) return "cpp";
  if (/^java(?:\s|\(|$)/.test(normalized)) return "java";
  if (/^(?:javascript|node\.js)(?:\s|\(|$)/.test(normalized)) return "javascript";
  if (/^python(?:\s|\(|$)/.test(normalized) && !/^python\s*\(2(?:[.)]|\.)/.test(normalized)) return "python";
  return "plaintext";
}

function starterFor(
  language: SupportedLanguage,
  problemStarterCode: string,
  languageStarterCodes: Record<string, string>,
) {
  const configuredStarter = languageStarterCodes[String(language.id)];
  if (configuredStarter !== undefined) return configuredStarter;
  switch (languageFamily(language.name)) {
    case "c":
      return "#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n";
    case "cpp":
      return "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n";
    case "java":
      return "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n    }\n}\n";
    case "javascript":
      return "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8');\n";
    case "python":
      return problemStarterCode.trim()
        ? problemStarterCode
        : "import sys\n\ndata = sys.stdin.read().split()\n";
    default:
      return "";
  }
}

function draftStorageKey(problemSlug: string, languageId: number) {
  return `astra-code-draft:${problemSlug}:${languageId}`;
}

function sessionStorageKey(problemSlug: string) {
  return `astra-problem-session:${problemSlug}`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function normalizeOutput(output: string | null) {
  return (output ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

export function CodeWorkspace({
  problemSlug,
  starterCode = pythonStarter,
  sampleInput = "",
  sampleOutput = "[0, 1]",
  judgeable = false,
  supportedLanguages = noSupportedLanguages,
  starterCodes = noStarterCodes,
}: {
  problemSlug: string;
  starterCode?: string;
  sampleInput?: string;
  sampleOutput?: string;
  judgeable?: boolean;
  supportedLanguages?: number[];
  starterCodes?: Record<string, string>;
}) {
  const [sourceCode, setSourceCode] = useState(starterCode);
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const [selectedLanguageId, setSelectedLanguageId] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [sessionEndedAt, setSessionEndedAt] = useState<string | null>(null);
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const [languageLoading, setLanguageLoading] = useState(true);
  const [languageError, setLanguageError] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>(() => [
    { label: "Case 1", input: sampleInput, expected: sampleOutput, isSample: true },
    ...(problemSlug === "longest-substring-without-repeating-characters"
      ? [{ label: "Case 2", input: "bbbbb", expected: "1", isSample: true }]
      : []),
  ]);
  const [activeCase, setActiveCase] = useState(0);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const canSubmit = judgeable || problemSlug === "longest-substring-without-repeating-characters";
  const selectedCase = testCases[activeCase] ?? testCases[0];
  const selectedLanguage = languages.find(({ id }) => id === selectedLanguageId);
  const sessionElapsedSeconds = sessionStartedAt
    ? Math.max(0, Math.floor(((sessionEndedAt ? Date.parse(sessionEndedAt) : sessionNow) - Date.parse(sessionStartedAt)) / 1_000))
    : null;

  useEffect(() => {
    let active = true;
    const key = sessionStorageKey(problemSlug);
    void Promise.resolve().then(() => {
      let startedAt: string;
      try {
        const saved = window.sessionStorage.getItem(key);
        const savedTime = saved ? Date.parse(saved) : Number.NaN;
        if (Number.isFinite(savedTime) && savedTime <= Date.now() && Date.now() - savedTime <= 30 * 24 * 60 * 60 * 1_000) {
          startedAt = new Date(savedTime).toISOString();
        } else {
          startedAt = new Date().toISOString();
          window.sessionStorage.setItem(key, startedAt);
        }
      } catch {
        startedAt = new Date().toISOString();
        setError("Browser storage is unavailable; the solving timer will reset if this page reloads.");
      }
      if (active) setSessionStartedAt(startedAt);
    });
    return () => { active = false; };
  }, [problemSlug]);

  useEffect(() => {
    if (!sessionStartedAt || sessionEndedAt) return;
    const timer = window.setInterval(() => setSessionNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [sessionEndedAt, sessionStartedAt]);

  const readDraft = useCallback((languageId: number) => {
    try {
      return window.sessionStorage.getItem(draftStorageKey(problemSlug, languageId));
    } catch {
      setError("Browser storage is unavailable; code drafts may not be preserved.");
      return null;
    }
  }, [problemSlug]);

  const saveDraft = useCallback((languageId: number, code: string) => {
    try {
      window.sessionStorage.setItem(draftStorageKey(problemSlug, languageId), code);
    } catch {
      setError("Could not preserve this code draft in browser storage.");
    }
  }, [problemSlug]);

  useEffect(() => {
    let active = true;
    apiRequest<{ languages: SupportedLanguage[] }>("/api/judge/languages")
      .then(({ languages: availableLanguages }) => {
        if (!active) return;
        if (availableLanguages.length === 0) {
          setLanguageError("No supported programming languages are available.");
          return;
        }
        const problemLanguages = supportedLanguages.length
          ? availableLanguages.filter(({ id }) => supportedLanguages.includes(id))
          : availableLanguages;
        if (problemLanguages.length === 0) {
          setLanguageError("No configured language is available in the current Judge0 service.");
          return;
        }
        setLanguages(problemLanguages);
        const initialLanguage = problemLanguages.find(({ name }) => languageFamily(name) === "python")
          ?? problemLanguages[0];
        setSelectedLanguageId(initialLanguage.id);
        const savedDraft = readDraft(initialLanguage.id);
        setSourceCode(savedDraft ?? starterFor(initialLanguage, starterCode, starterCodes));
      })
      .catch((cause: unknown) => {
        if (active) {
          setLanguageError(cause instanceof Error ? cause.message : "Could not load available languages.");
        }
      })
      .finally(() => {
        if (active) setLanguageLoading(false);
      });
    return () => { active = false; };
  }, [problemSlug, readDraft, starterCode, starterCodes, supportedLanguages]);

  function clearResults() {
    setResult(null);
    setSubmissionResult(null);
    setError("");
  }

  function updateCaseInput(value: string) {
    setTestCases((cases) => cases.map((testCase, index) =>
      index === activeCase ? { ...testCase, input: value, expected: "", isSample: false } : testCase,
    ));
    clearResults();
  }

  async function handleRunCode() {
    setRunning(true);
    clearResults();
    try {
      const execution = await apiRequest<ExecutionResult>("/api/judge/execute", {
        method: "POST",
        body: JSON.stringify({
          language_id: selectedLanguageId,
          source_code: sourceCode,
          stdin: selectedCase.input,
        }),
      });
      setResult(execution);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run code.");
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    const attemptStartedAt = sessionEndedAt ? new Date().toISOString() : sessionStartedAt;
    if (!attemptStartedAt) {
      setError("The solving timer is still starting. Try submitting again in a moment.");
      return;
    }
    setSubmitting(true);
    clearResults();
    setSessionStartedAt(attemptStartedAt);
    setSessionEndedAt(null);
    setSessionNow(Date.now());
    try {
      window.sessionStorage.setItem(sessionStorageKey(problemSlug), attemptStartedAt);
    } catch {
      setError("The solving timer could not be preserved in browser storage.");
      setSubmitting(false);
      return;
    }
    try {
      const submitted = await apiRequest<SubmissionResult>("/api/judge/submit", {
        method: "POST",
        body: JSON.stringify({
          problem_slug: problemSlug,
          language_id: selectedLanguageId,
          source_code: sourceCode,
          session_started_at: attemptStartedAt,
        }),
      });
      const sessionEnded = submitted.session_ended_at ?? new Date().toISOString();
      setSessionEndedAt(sessionEnded);
      setSubmissionResult(submitted);
      try {
        window.sessionStorage.removeItem(sessionStorageKey(problemSlug));
      } catch {
        setError("The submission was saved, but the finished session could not be cleared from browser storage.");
      }
      if (submitted.accepted) {
        window.dispatchEvent(new CustomEvent("astra:streak-updated", {
          detail: submitted.current_streak,
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your solution.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRestoreStarter() {
    if (!selectedLanguage) return;
    const nextSourceCode = starterFor(selectedLanguage, starterCode, starterCodes);
    setSourceCode(nextSourceCode);
    saveDraft(selectedLanguage.id, nextSourceCode);
    clearResults();
  }

  const output = result?.compile_output || result?.stderr || result?.stdout;
  const hasExpectedOutput = selectedCase.isSample || selectedCase.expected.length > 0;
  const runPassed = result?.status === "Accepted" && hasExpectedOutput && result.stdout !== null
    && normalizeOutput(result.stdout) === normalizeOutput(selectedCase.expected);
  const editorLanguage = selectedLanguage ? languageFamily(selectedLanguage.name) : "plaintext";
  const fileExtension = editorLanguage === "python" ? "py"
    : editorLanguage === "javascript" ? "js"
      : editorLanguage === "java" ? "java"
        : editorLanguage === "c" ? "c"
          : editorLanguage === "cpp" ? "cpp"
            : "txt";

  return (
    <section className="problem-console" aria-label="Code editor and test cases">
      <div className="problem-console-toolbar">
        <label className="problem-console-language">
          <span className="problem-language-dot" />
          <select
            aria-label="Programming language"
            value={selectedLanguageId ?? ""}
            disabled={languageLoading || languages.length === 0 || running || submitting}
            onChange={(event) => {
              if (selectedLanguageId !== null) {
                saveDraft(selectedLanguageId, sourceCode);
              }
              const nextId = Number(event.target.value);
              const nextLanguage = languages.find(({ id }) => id === nextId);
              if (!nextLanguage) return;
              setSelectedLanguageId(nextId);
              setSourceCode(
                readDraft(nextId)
                  ?? starterFor(nextLanguage, starterCode, starterCodes),
              );
              clearResults();
            }}
          >
            {languageLoading && <option value="">Loading languages…</option>}
            {languages.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span className="problem-language-chevron" aria-hidden="true">⌄</span>
        </label>
        <div className="problem-console-actions">
          <span
            className="problem-session-timer"
            title="Time spent in this problem-solving session"
            aria-label={`Session time ${sessionElapsedSeconds === null ? "starting" : formatDuration(sessionElapsedSeconds)}`}
          >
            <Clock3 size={14} aria-hidden="true" />
            {sessionElapsedSeconds === null ? "Starting timer…" : formatDuration(sessionElapsedSeconds)}
          </span>
          <button
            className="problem-run-button"
            type="button"
            onClick={handleRunCode}
            disabled={running || submitting || selectedLanguageId === null}
            aria-busy={running}
          >
            <Play size={15} aria-hidden="true" />
            {running ? "Running…" : "Run"}
          </button>
          <button
            className="problem-submit-button"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || running || !canSubmit || selectedLanguageId === null}
            aria-busy={submitting}
            title={!canSubmit ? "Judging is not available for this problem yet." : undefined}
          >
            <CloudUpload size={16} aria-hidden="true" />
            {submitting ? "Submitting…" : canSubmit ? "Submit" : "Unavailable"}
          </button>
        </div>
      </div>

      <div className="problem-editor-toolbar">
        <div><span className="problem-editor-file-icon">{"</>"}</span> solution.{fileExtension}</div>
        <div className="problem-editor-tools">
          <span className="problem-editor-status"><span /> Editor ready · clipboard disabled</span>
          <button type="button" onClick={handleRestoreStarter} aria-label="Restore starter code" title="Restore starter code">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div className="problem-editor">
        <Editor
          height="100%"
          language={editorLanguage}
          theme="vs-dark"
          value={sourceCode}
          onChange={(value) => {
            const nextSourceCode = value ?? "";
            setSourceCode(nextSourceCode);
            if (sessionEndedAt) {
              const nextStartedAt = new Date().toISOString();
              setSessionStartedAt(nextStartedAt);
              setSessionEndedAt(null);
              setSessionNow(Date.now());
              try {
                window.sessionStorage.setItem(sessionStorageKey(problemSlug), nextStartedAt);
              } catch {
                setError("The new solving session could not be preserved in browser storage.");
              }
            }
            if (selectedLanguageId !== null) {
              saveDraft(selectedLanguageId, nextSourceCode);
            }
            clearResults();
          }}
          onMount={(editor, monaco) => {
            const node = editor.getDomNode();
            const blockClipboard = (event: Event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
            };
            node?.addEventListener("copy", blockClipboard, true);
            node?.addEventListener("cut", blockClipboard, true);
            node?.addEventListener("paste", blockClipboard, true);
            node?.addEventListener("contextmenu", blockClipboard, true);
            const noClipboardAction = () => undefined;
            [
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC,
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX,
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.Insert,
              monaco.KeyMod.Shift | monaco.KeyCode.Insert,
            ].forEach((keybinding) => editor.addCommand(keybinding, noClipboardAction));
            editor.updateOptions({ contextmenu: false });
            editor.onDidDispose(() => {
              node?.removeEventListener("copy", blockClipboard, true);
              node?.removeEventListener("cut", blockClipboard, true);
              node?.removeEventListener("paste", blockClipboard, true);
              node?.removeEventListener("contextmenu", blockClipboard, true);
            });
          }}
          options={{
            automaticLayout: true,
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: 14,
            lineNumbers: "on",
            minimap: { enabled: false },
            padding: { top: 18, bottom: 18 },
            readOnly: running || submitting,
            contextmenu: false,
            scrollBeyondLastLine: false,
            tabSize: 4,
            wordWrap: "on",
          }}
        />
      </div>

      <section className="problem-test-panel" aria-label="Test cases and results">
        <div className="problem-test-panel-heading">
          <div className="problem-test-panel-title">
            <FlaskConical size={15} aria-hidden="true" />
            <span>Test cases</span>
          </div>
          {(error || languageError) && <span className="problem-result-error" role="alert">{error || languageError}</span>}
          {canSubmit && !error && (
            <span className="problem-test-count">{testCases.length} sample case{testCases.length === 1 ? "" : "s"}</span>
          )}
        </div>
        <div className="problem-test-case-tabs" role="tablist" aria-label="Test cases">
          {testCases.map((testCase, index) => (
            <button
              key={testCase.label}
              id={`test-case-tab-${index}`}
              className={activeCase === index ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeCase === index}
              aria-controls="problem-test-case-content"
              onClick={() => {
                setActiveCase(index);
                clearResults();
              }}
            >
              {testCase.label}
            </button>
          ))}
        </div>
        <div
          className="problem-test-case-content"
          id="problem-test-case-content"
          role="tabpanel"
          aria-labelledby={`test-case-tab-${activeCase}`}
        >
          <label>
            <span>Input</span>
            <textarea
              value={selectedCase.input}
              onChange={(event) => updateCaseInput(event.target.value)}
              spellCheck={false}
              aria-label="Test case input"
            />
          </label>
          <label>
            <span>{selectedCase.isSample ? "Expected output" : "Expected output (optional)"}</span>
            <textarea
              value={selectedCase.expected}
              readOnly={selectedCase.isSample}
              onChange={(event) => {
                setTestCases((cases) => cases.map((testCase, index) =>
                  index === activeCase ? { ...testCase, expected: event.target.value } : testCase,
                ));
                clearResults();
              }}
              spellCheck={false}
              aria-label="Expected output"
            />
          </label>
        </div>
        {(submissionResult || result || error) && (
          <div className="problem-test-result" aria-live="polite">
            {submissionResult ? (
              <div className={submissionResult.accepted ? "is-accepted" : "is-rejected"} role="status">
                <strong>{submissionResult.verdict}</strong>
                {submissionResult.passed_test_cases !== undefined && submissionResult.total_test_cases !== undefined && (
                  <span> · Passed {submissionResult.passed_test_cases}/{submissionResult.total_test_cases} tests ({submissionResult.tests_run ?? submissionResult.total_test_cases} run)</span>
                )}
                {submissionResult.failed_test_case && (
                  <span> on test case {submissionResult.failed_test_case}.</span>
                )}
                {submissionResult.diagnostic && <pre>{submissionResult.diagnostic}</pre>}
                {submissionResult.accepted && submissionResult.current_streak !== undefined && (
                  <span>
                    {" "}Your current streak: {submissionResult.current_streak}{" "}
                    {submissionResult.current_streak === 1 ? "day" : "days"}.
                  </span>
                )}
                {submissionResult.time_taken_seconds !== undefined && (
                  <span> · Session time: {formatDuration(submissionResult.time_taken_seconds)}</span>
                )}
              </div>
            ) : result ? (
              <div
                className={runPassed || (result.status === "Accepted" && !hasExpectedOutput) ? "is-accepted" : "is-rejected"}
                role="status"
              >
                <strong>
                  {result.status !== "Accepted"
                    ? result.status
                    : !hasExpectedOutput
                      ? "Execution finished"
                      : runPassed ? "Output matched" : "Wrong Answer"}
                </strong>
                <pre>{output || (result.status_id === 3 ? "Program finished without output." : result.status)}</pre>
                {(result.time !== null || result.memory !== null) && (
                  <small>
                    {result.time !== null ? `Time: ${result.time}s` : ""}
                    {result.time !== null && result.memory !== null ? " · " : ""}
                    {result.memory !== null ? `Memory: ${result.memory} KB` : ""}
                  </small>
                )}
              </div>
            ) : null}
          </div>
        )}
        {!canSubmit && (
          <p className="problem-judging-note">
            Only accepted submissions count toward your streak. Test-case judging is not enabled for this problem yet.
          </p>
        )}
      </section>
    </section>
  );
}
