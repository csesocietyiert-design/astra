"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookPlus, FileJson2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";
import { problems as builtInProblems, type Problem } from "@/lib/data";

const testCaseSchema = z.object({
  input: z.string().max(10_000),
  expected: z.string().max(10_000),
  is_public: z.boolean().default(false),
});

const questionSchema = z.object({
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

const questionListSchema = z.array(questionSchema).min(1).max(25);
type Question = z.infer<typeof questionSchema>;
type TestCase = z.infer<typeof testCaseSchema>;
type FormQuestion = Omit<Question, "tags"> & { tags: string };
type ImportState = { questions: Question[]; errors: string[] };
type JudgeLanguage = { id: number; name: string };
type ManagedProblem = Problem & {
  testCases: TestCase[];
  publicationStatus: "published" | "archived";
  timeLimitMs: number;
  memoryLimitMb: number;
  supportedLanguages: number[];
  starterCodes: Record<string, string>;
};
type ProblemDraft = {
  draft_id: string;
  problem_id: string | null;
  title: string;
  draft_data: Record<string, unknown>;
};

const emptyForm: FormQuestion = {
  title: "",
  difficulty: "Easy",
  topic: "",
  tags: "",
  description: "",
  input_format: "",
  output_format: "",
  constraints: "",
  sample_input: "",
  sample_output: "",
  starter_code: "",
  supported_languages: [],
  starter_codes: {},
  time_limit_ms: 2_000,
  memory_limit_mb: 256,
  test_cases: [{ input: "", expected: "", is_public: false }],
};

const questionTemplate = {
  questions: [{
    title: "Sum of Two Numbers",
    difficulty: "Easy",
    topic: "Math",
    tags: ["math", "implementation"],
    description: "Read two integers and print their sum.",
    input_format: "Two integers separated by a space.",
    output_format: "Print their sum.",
    constraints: "Both integers fit in a signed 32-bit integer.",
    sample_input: "2 3",
    sample_output: "5",
    starter_code: "a, b = map(int, input().split())\nprint(a + b)",
    supported_languages: [],
    starter_codes: {},
    time_limit_ms: 2_000,
    memory_limit_mb: 256,
    test_cases: [
      { input: "2 3", expected: "5", is_public: true },
      { input: "-4 9", expected: "5", is_public: false },
    ],
  }],
};

function toQuestionPayload(form: FormQuestion): unknown {
  return {
    ...form,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function validateQuestionList(value: unknown): ImportState {
  const list = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && "questions" in value
      ? value.questions
      : [value];
  const parsed = questionListSchema.safeParse(list);
  if (parsed.success) {
    const usedSlugs = new Set(builtInProblems.map(({ slug }) => slug));
    const errors: string[] = [];
    for (const [index, question] of parsed.data.entries()) {
      const slug = question.title.toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");
      if (!slug) continue;
      if (usedSlugs.has(slug)) {
        errors.push(`Question ${index + 1} · title: the generated URL is already used by a built-in or imported question.`);
      } else {
        usedSlugs.add(slug);
      }
    }
    return errors.length ? { questions: [], errors } : { questions: parsed.data, errors: [] };
  }
  return {
    questions: [],
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.map(String);
      const questionIndex = path[0] && /^\d+$/.test(path[0]) ? Number(path.shift()) + 1 : null;
      return `${questionIndex === null ? "JSON" : `Question ${questionIndex}`}${path.length ? ` · ${path.join(".")}` : ""}: ${issue.message}`;
    }),
  };
}

function questionSchemaIssues(payload: unknown, fields: string[]) {
  const parsed = questionSchema.safeParse(payload);
  if (parsed.success) return [];
  return parsed.error.issues
    .filter((issue) => fields.includes(String(issue.path[0])))
    .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`);
}

export function AdminProblems() {
  const [mode, setMode] = useState<"single" | "json">("single");
  const [form, setForm] = useState<FormQuestion>(emptyForm);
  const [step, setStep] = useState(0);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [languages, setLanguages] = useState<JudgeLanguage[]>([]);
  const [managedProblems, setManagedProblems] = useState<ManagedProblem[]>([]);
  const [drafts, setDrafts] = useState<ProblemDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);

  async function refreshManageData() {
    const managed = await apiRequest<{ problems: ManagedProblem[]; drafts: ProblemDraft[] }>("/api/problems/manage");
    setManagedProblems(managed.problems);
    setDrafts(managed.drafts);
    try {
      const languageResult = await apiRequest<{ languages: JudgeLanguage[] }>("/api/judge/languages");
      setLanguages(languageResult.languages);
    } catch (cause) {
      setError(cause instanceof Error
        ? `Questions loaded, but Judge0 languages could not be loaded: ${cause.message}`
        : "Questions loaded, but Judge0 languages could not be loaded.");
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refreshManageData).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load the problem manager.");
    });
  }, []);

  function updateForm<K extends keyof FormQuestion>(key: K, value: FormQuestion[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStepErrors([]);
    setError("");
  }

  function updateTestCase(index: number, key: keyof TestCase, value: string | boolean) {
    setForm((current) => ({
      ...current,
      test_cases: current.test_cases.map((testCase, caseIndex) =>
        caseIndex === index ? { ...testCase, [key]: value } : testCase,
      ),
    }));
    setStepErrors([]);
    setError("");
  }

  function editProblem(problem: ManagedProblem) {
    setForm({
      title: problem.title,
      difficulty: problem.difficulty,
      topic: problem.topic ?? "",
      tags: problem.tags.join(", "),
      description: problem.description ?? "",
      input_format: problem.inputFormat ?? "",
      output_format: problem.outputFormat ?? "",
      constraints: problem.constraints ?? "",
      sample_input: problem.sampleInput ?? "",
      sample_output: problem.sampleOutput ?? "",
      starter_code: problem.starterCode ?? "",
      supported_languages: problem.supportedLanguages,
      starter_codes: problem.starterCodes,
      time_limit_ms: problem.timeLimitMs,
      memory_limit_mb: problem.memoryLimitMb,
      test_cases: problem.testCases.map(({ input, expected, is_public }) => ({
        input: String(input ?? ""),
        expected: String(expected ?? ""),
        is_public: is_public === true,
      })),
    });
    setEditingProblemId(problem.id);
    setActiveDraftId(null);
    setStep(0);
    setMode("single");
    setError("");
    setSuccess(`Editing ${problem.title}. Save a draft or publish when ready.`);
  }

  function editDraft(draft: ProblemDraft) {
    const data = draft.draft_data;
    const draftString = (key: string) => typeof data[key] === "string" ? data[key] as string : "";
    const draftNumber = (key: string, fallback: number) =>
      typeof data[key] === "number" && Number.isFinite(data[key]) ? data[key] as number : fallback;
    const draftStringRecord = data.starter_codes && typeof data.starter_codes === "object" && !Array.isArray(data.starter_codes)
      ? Object.fromEntries(Object.entries(data.starter_codes).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
    setForm({
      ...emptyForm,
      title: draftString("title"),
      difficulty: data.difficulty === "Medium" || data.difficulty === "Hard" ? data.difficulty : "Easy",
      topic: draftString("topic"),
      tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "",
      description: draftString("description"),
      input_format: draftString("input_format"),
      output_format: draftString("output_format"),
      constraints: draftString("constraints"),
      sample_input: draftString("sample_input"),
      sample_output: draftString("sample_output"),
      starter_code: draftString("starter_code"),
      supported_languages: Array.isArray(data.supported_languages)
        ? data.supported_languages.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
        : [],
      starter_codes: draftStringRecord,
      time_limit_ms: draftNumber("time_limit_ms", 2_000),
      memory_limit_mb: draftNumber("memory_limit_mb", 256),
      test_cases: Array.isArray(data.test_cases)
        ? data.test_cases.map((testCase) => {
          const item = testCase as Partial<TestCase>;
          return {
            input: typeof item.input === "string" ? item.input : "",
            expected: typeof item.expected === "string" ? item.expected : "",
            is_public: item.is_public === true,
          };
        })
        : [{ input: "", expected: "", is_public: false }],
    } as FormQuestion);
    setActiveDraftId(draft.draft_id);
    setEditingProblemId(draft.problem_id);
    setStep(0);
    setMode("single");
    setError("");
    setSuccess(`Draft loaded${draft.title ? `: ${draft.title}` : ""}.`);
  }

  function nextStep() {
    const payload = toQuestionPayload(form);
    const fieldsByStep = [
      ["title", "difficulty", "topic", "tags"],
      ["description", "input_format", "output_format", "constraints", "sample_input", "sample_output", "starter_code"],
      ["test_cases"],
    ];
    const errors = questionSchemaIssues(payload, fieldsByStep[step] ?? []);
    setStepErrors(errors);
    if (!errors.length) setStep((current) => Math.min(current + 1, 2));
  }

  async function createQuestions(questions: Question[]) {
    const body = JSON.stringify({ questions });
    if (new TextEncoder().encode(body).byteLength > 90_000) {
      setError("The question data is larger than 90 KB. Reduce the statement or test-case data before saving.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{ problems: Problem[] }>("/api/problems", {
        method: "POST",
        body,
      });
      setSuccess(`${result.problems.length} question${result.problems.length === 1 ? "" : "s"} added. They are now available in the problem library.`);
      setForm(emptyForm);
      setStep(0);
      setImportState(null);
      setImportFileName("");
      await refreshManageData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the questions.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSingleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateQuestionList([toQuestionPayload(form)]);
    if (validation.errors.length) {
      setStepErrors(validation.errors);
      return;
    }
    await saveDraft(true, validation.questions[0]);
  }

  async function saveDraft(publish: boolean, validQuestion?: Question) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const draftResult = await apiRequest<{ draft: ProblemDraft }>("/api/problems/drafts", {
        method: "POST",
        body: JSON.stringify({
          ...(activeDraftId ? { draft_id: activeDraftId } : {}),
          ...(editingProblemId ? { problem_id: editingProblemId } : {}),
          draft_data: validQuestion ?? toQuestionPayload(form),
        }),
      });
      setActiveDraftId(draftResult.draft.draft_id);
      if (publish) {
        await apiRequest<{ problem: Problem }>(`/api/problems/drafts/${draftResult.draft.draft_id}/publish`, {
          method: "POST",
        });
        setSuccess(editingProblemId ? "Question changes published." : "Question published and available in the problem library.");
        setForm(emptyForm);
        setActiveDraftId(null);
        setEditingProblemId(null);
        setStep(0);
      } else {
        setSuccess("Draft saved. You can return to it from the draft list.");
      }
      await refreshManageData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the question.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(problem: ManagedProblem) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/problems/${encodeURIComponent(problem.slug)}/archive`, {
        method: "PATCH",
        body: JSON.stringify({ archived: problem.publicationStatus !== "archived" }),
      });
      await refreshManageData();
      setSuccess(problem.publicationStatus === "archived" ? "Question published." : "Question archived.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update publication status.");
    } finally {
      setBusy(false);
    }
  }

  async function loadJsonFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setImportFileName("");
    setImportState(null);
    setError("");
    setSuccess("");
    if (!file) return;
    if (file.size > 90_000) {
      setImportFileName(file.name);
      setImportState({ questions: [], errors: ["The JSON file must be smaller than 90 KB."] });
      return;
    }
    try {
      const state = validateQuestionList(JSON.parse(await file.text()) as unknown);
      setImportFileName(file.name);
      setImportState(state);
    } catch {
      setImportFileName(file.name);
      setImportState({ questions: [], errors: ["The file is not valid JSON."] });
    }
  }

  function downloadTemplate() {
    const file = new Blob([JSON.stringify(questionTemplate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "astra-question-template.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submitJsonQuestions() {
    if (!importState || importState.errors.length || !importState.questions.length) return;
    await createQuestions(importState.questions);
  }

  return (
    <section className="admin-question-manager" aria-labelledby="admin-questions-title">
      <div className="admin-question-heading">
        <div>
          <p className="admin-question-eyebrow"><BookPlus size={15} aria-hidden="true" /> PROBLEM LIBRARY</p>
          <h2 id="admin-questions-title">Add questions</h2>
          <p>Create one question step by step, or validate and import a JSON batch.</p>
        </div>
        <Link href="/problems">View problem library <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>

      <div className="admin-question-mode-tabs" role="tablist" aria-label="Question creation method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          className={mode === "single" ? "is-active" : ""}
          onClick={() => { setMode("single"); setError(""); setSuccess(""); }}
        >
          <BookPlus size={15} aria-hidden="true" /> Add one question
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "json"}
          className={mode === "json" ? "is-active" : ""}
          onClick={() => { setMode("json"); setError(""); setSuccess(""); }}
        >
          <FileJson2 size={15} aria-hidden="true" /> Import JSON
        </button>
      </div>

      {error && <p className="admin-form-message is-error" role="alert">{error}</p>}
      {success && <p className="admin-form-message is-success" role="status">{success}</p>}

      {(managedProblems.length > 0 || drafts.length > 0) && (
        <div className="admin-question-library-list">
          <h3>Manage questions</h3>
          {managedProblems.map((problem) => (
            <div className="admin-question-library-row" key={problem.id}>
              <span><strong>{problem.title}</strong><small>{problem.publicationStatus} · {problem.difficulty}</small></span>
              <button type="button" disabled={busy} onClick={() => editProblem(problem)}>Edit</button>
              <button type="button" disabled={busy} onClick={() => void toggleArchive(problem)}>
                {problem.publicationStatus === "archived" ? "Publish" : "Archive"}
              </button>
            </div>
          ))}
          {drafts.map((draft) => (
            <div className="admin-question-library-row" key={draft.draft_id}>
              <span><strong>{draft.title || "Untitled draft"}</strong><small>Draft</small></span>
              <button type="button" onClick={() => editDraft(draft)}>Continue editing</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void apiRequest(`/api/problems/drafts/${draft.draft_id}`, { method: "DELETE" })
                    .then(refreshManageData)
                    .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not delete draft."))
                    .finally(() => setBusy(false));
                }}
              >
                Delete draft
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === "single" ? (
        <form className="admin-question-form" onSubmit={submitSingleQuestion}>
          <div className="admin-question-stepper" aria-label="Question details">
            {["Basics", "Statement", "Judge0 tests"].map((label, index) => (
              <span key={label} className={index === step ? "is-active" : index < step ? "is-complete" : ""}>
                <i>{index + 1}</i>{label}
              </span>
            ))}
          </div>

          {step === 0 && (
            <fieldset className="admin-question-step">
              <legend>Question basics</legend>
              <p>Start with the title and classification shown to members.</p>
              <label>Question title<input value={form.title} onChange={(event) => updateForm("title", event.target.value)} minLength={3} maxLength={120} required /></label>
              <div className="admin-question-field-row">
                <label>Difficulty
                  <select value={form.difficulty} onChange={(event) => updateForm("difficulty", event.target.value as FormQuestion["difficulty"])}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </label>
                <label>Topic<input value={form.topic} onChange={(event) => updateForm("topic", event.target.value)} minLength={2} maxLength={60} placeholder="Arrays, graphs, strings…" required /></label>
              </div>
              <label>Tags <span className="admin-question-label-note">(comma separated)</span>
                <input value={form.tags} onChange={(event) => updateForm("tags", event.target.value)} placeholder="arrays, two-pointers" required />
              </label>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="admin-question-step">
              <legend>Problem statement and sample</legend>
              <p>These details appear beside the code editor.</p>
              <label>Problem statement<textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} rows={4} maxLength={4000} required /></label>
              <label>Input format<textarea value={form.input_format} onChange={(event) => updateForm("input_format", event.target.value)} rows={2} maxLength={2000} required /></label>
              <label>Output format<textarea value={form.output_format} onChange={(event) => updateForm("output_format", event.target.value)} rows={2} maxLength={2000} required /></label>
              <label>Constraints<textarea value={form.constraints} onChange={(event) => updateForm("constraints", event.target.value)} rows={2} maxLength={2000} required /></label>
              <div className="admin-question-field-row">
                <label>Sample input<textarea value={form.sample_input} onChange={(event) => updateForm("sample_input", event.target.value)} rows={3} maxLength={10000} /></label>
                <label>Sample output<textarea value={form.sample_output} onChange={(event) => updateForm("sample_output", event.target.value)} rows={3} maxLength={10000} /></label>
              </div>
              <div className="admin-question-field-row">
                <label>Time limit (ms)<input type="number" min={100} max={30000} value={form.time_limit_ms} onChange={(event) => updateForm("time_limit_ms", Number(event.target.value))} required /></label>
                <label>Memory limit (MB)<input type="number" min={16} max={1024} value={form.memory_limit_mb} onChange={(event) => updateForm("memory_limit_mb", Number(event.target.value))} required /></label>
              </div>
              <fieldset className="admin-question-language-list">
                <legend>Supported Judge0 languages</legend>
                <p>Leave all unchecked to enable every configured language.</p>
                <div>
                  {languages.map((language) => (
                    <label key={language.id}>
                      <input
                        type="checkbox"
                        checked={form.supported_languages.includes(language.id)}
                        onChange={(event) => updateForm(
                          "supported_languages",
                          event.target.checked
                            ? [...form.supported_languages, language.id]
                            : form.supported_languages.filter((id) => id !== language.id),
                        )}
                      />
                      {language.name} (ID {language.id})
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>Python starter code <span className="admin-question-label-note">(fallback for Python 3)</span>
                <textarea className="admin-question-code-input" value={form.starter_code} onChange={(event) => updateForm("starter_code", event.target.value)} rows={6} maxLength={30000} spellCheck={false} />
              </label>
              {languages.filter(({ id }) => form.supported_languages.includes(id)).map((language) => (
                <label key={language.id}>{language.name} starter code <span className="admin-question-label-note">(optional)</span>
                  <textarea
                    className="admin-question-code-input"
                    value={form.starter_codes[String(language.id)] ?? ""}
                    onChange={(event) => updateForm("starter_codes", { ...form.starter_codes, [String(language.id)]: event.target.value })}
                    rows={5}
                    maxLength={30000}
                    spellCheck={false}
                  />
                </label>
              ))}
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="admin-question-step">
              <legend>Judge0 test cases</legend>
              <p>Judge0 runs the submitted program in the selected language with each input and compares its stdout with the expected output. Add between 1 and 25 cases.</p>
              {form.test_cases.map((testCase, index) => (
                <div className="admin-question-test-case" key={index}>
                  <div className="admin-question-test-case-heading">
                    <strong>Test case {index + 1}</strong>
                    {form.test_cases.length > 1 && (
                      <button type="button" onClick={() => updateForm("test_cases", form.test_cases.filter((_, caseIndex) => caseIndex !== index))} aria-label={`Remove test case ${index + 1}`}>
                        <Trash2 size={14} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                  <div className="admin-question-field-row">
                    <label>Input passed to Judge0<textarea value={testCase.input} onChange={(event) => updateTestCase(index, "input", event.target.value)} rows={3} maxLength={10000} spellCheck={false} required /></label>
                    <label>Expected stdout<textarea value={testCase.expected} onChange={(event) => updateTestCase(index, "expected", event.target.value)} rows={3} maxLength={10000} spellCheck={false} required /></label>
                  </div>
                  <label className="admin-question-public-case">
                    <input type="checkbox" checked={testCase.is_public} onChange={(event) => updateTestCase(index, "is_public", event.target.checked)} />
                    This is a public example (input/output shown to learners)
                  </label>
                </div>
              ))}
              <button
                className="admin-question-add-case"
                type="button"
                disabled={form.test_cases.length >= 25}
                onClick={() => updateForm("test_cases", [...form.test_cases, { input: "", expected: "", is_public: false }])}
              >
                <Plus size={15} aria-hidden="true" /> Add test case
              </button>
              <p className="admin-question-judge-note">Only marked examples are shown publicly; all test inputs and expected output stay private from learners.</p>
            </fieldset>
          )}

          {stepErrors.length > 0 && (
            <div className="admin-question-validation" role="alert">
              <strong>Review these details before continuing:</strong>
              <ul>{stepErrors.map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          )}

          <div className="admin-question-form-footer">
            {step > 0 ? (
              <button className="admin-question-secondary-button" type="button" onClick={() => { setStep((current) => current - 1); setStepErrors([]); }}>
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </button>
            ) : <span className="admin-question-footer-hint">All fields are checked again before saving.</span>}
            {step < 2 ? (
              <button className="admin-question-primary-button" type="button" onClick={nextStep}>Continue <ArrowRight size={15} aria-hidden="true" /></button>
            ) : (
              <button className="admin-question-primary-button" type="submit" disabled={busy}>
                <BookPlus size={15} aria-hidden="true" /> {busy ? "Saving…" : editingProblemId ? "Publish changes" : "Publish question"}
              </button>
            )}
            {step === 2 && (
              <button className="admin-question-secondary-button" type="button" disabled={busy} onClick={() => void saveDraft(false)}>
                {busy ? "Saving…" : "Save draft"}
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="admin-json-import">
          <div className="admin-json-import-instructions">
            <div>
              <h3>Import questions from JSON</h3>
              <p>Upload a JSON array, an object with a <code>questions</code> array, or one question object. Each question uses the same fields and validation as the single-question form.</p>
            </div>
            <button type="button" onClick={downloadTemplate}><FileJson2 size={15} aria-hidden="true" /> Download template</button>
          </div>
          <label className="admin-json-file-picker">
            <FileJson2 size={21} aria-hidden="true" />
            <strong>{importFileName || "Choose a .json file"}</strong>
            <span>Up to 25 questions · maximum file size 90 KB</span>
            <input type="file" accept=".json,application/json" onChange={loadJsonFile} />
          </label>
          {importState && (
            <div className={`admin-json-validation ${importState.errors.length ? "is-error" : "is-valid"}`} aria-live="polite">
              {importState.errors.length ? (
                <>
                  <strong>JSON needs changes before import</strong>
                  <ul>{importState.errors.map((message) => <li key={message}>{message}</li>)}</ul>
                </>
              ) : (
                <>
                  <strong>{importState.questions.length} question{importState.questions.length === 1 ? "" : "s"} validated successfully</strong>
                  <ul>{importState.questions.map((question, index) => (
                    <li key={`${question.title}-${index}`}>{question.title} · {question.test_cases.length} Judge0 test case{question.test_cases.length === 1 ? "" : "s"}</li>
                  ))}</ul>
                  <p>No questions are saved until you choose Import validated questions.</p>
                </>
              )}
            </div>
          )}
          <div className="admin-question-form-footer">
            <span className="admin-question-footer-hint">The entire file is checked before anything is submitted.</span>
            <button
              className="admin-question-primary-button"
              type="button"
              disabled={busy || !importState || importState.errors.length > 0 || importState.questions.length === 0}
              onClick={submitJsonQuestions}
            >
              <FileJson2 size={15} aria-hidden="true" /> {busy ? "Importing…" : "Import validated questions"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
