"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardList, MessageSquareText, NotebookPen, Sparkles } from "lucide-react";
import { CodeWorkspace } from "@/components/code-workspace";
import { PortalShell } from "@/components/portal-shell";
import { problems as builtInProblems } from "@/lib/data";
import type { Problem } from "@/lib/data";
import { apiRequest } from "@/lib/api";

export default function ProblemDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const builtInProblem = builtInProblems.find((entry) => entry.slug === slug);
  const [remoteProblem, setRemoteProblem] = useState<{ slug: string; problem: Problem } | null>(null);
  const [otherProblems, setOtherProblems] = useState<Problem[]>(builtInProblems);
  const [loadFailure, setLoadFailure] = useState<{ slug: string; message: string } | null>(null);
  const problem = builtInProblem ?? (remoteProblem?.slug === slug ? remoteProblem.problem : null);
  const loading = !builtInProblem && !problem && loadFailure?.slug !== slug;
  const error = loadFailure?.slug === slug ? loadFailure.message : "";

  useEffect(() => {
    if (builtInProblem) return;
    let active = true;
    apiRequest<{ problem: Problem }>(`/api/problems/${encodeURIComponent(slug)}`)
      .then(({ problem: storedProblem }) => {
        if (active) setRemoteProblem({ slug, problem: storedProblem });
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadFailure({
            slug,
            message: cause instanceof Error ? cause.message : "Could not load this question.",
          });
        }
      });
    apiRequest<{ problems: Problem[] }>("/api/problems")
      .then(({ problems: storedProblems }) => {
        if (!active) return;
        const storedSlugs = new Set(storedProblems.map(({ slug: itemSlug }) => itemSlug));
        setOtherProblems([
          ...storedProblems,
          ...builtInProblems.filter(({ slug: itemSlug }) => !storedSlugs.has(itemSlug)),
        ]);
      })
      .catch(() => {
        if (active) {
          setLoadFailure((current) => current?.slug === slug
            ? current
            : { slug, message: "Could not load the question navigation list." });
        }
      });
    return () => { active = false; };
  }, [builtInProblem, slug]);

  if (loading) {
    return <PortalShell><main className="container-shell portal-content"><p role="status">Loading question…</p></main></PortalShell>;
  }
  if (!problem) {
    return (
      <PortalShell>
        <main className="container-shell portal-content">
          <section className="admin-access-state">
            <h1>Question unavailable</h1>
            <p>{error || "This question could not be found."}</p>
            <Link href="/problems"><ArrowLeft size={15} aria-hidden="true" /> Back to problem library</Link>
          </section>
        </main>
      </PortalShell>
    );
  }

  const problemIndex = otherProblems.findIndex((entry) => entry.slug === problem.slug);
  const previousProblem = otherProblems[problemIndex - 1];
  const nextProblem = otherProblems[problemIndex + 1];

  return (
    <PortalShell>
      <main className="container-shell portal-content problem-solving-page">
        {error && <p className="mb-4 text-sm text-amber-200" role="status">{error}</p>}
        <div className="problem-solving-toolbar">
          <div className="problem-breadcrumb">
            <Link href="/problems"><ArrowLeft size={15} aria-hidden="true" /> Problem list</Link>
            <span className="problem-breadcrumb-separator">/</span>
            <span>{problem.id}</span>
          </div>
          <div className="problem-navigation-controls" aria-label="Problem navigation">
            {previousProblem ? (
              <Link href={`/problems/${previousProblem.slug}`} aria-label="Previous problem" title={previousProblem.title}>
                <ArrowLeft size={16} />
              </Link>
            ) : <span aria-disabled="true" title="No previous problem"><ArrowLeft size={16} /></span>}
            <Link href="/problems" aria-label="All problems" title="Problem list"><ClipboardList size={16} /></Link>
            {nextProblem ? (
              <Link href={`/problems/${nextProblem.slug}`} aria-label="Next problem" title={nextProblem.title}>
                <ArrowRight size={16} />
              </Link>
            ) : <span aria-disabled="true" title="No next problem"><ArrowRight size={16} /></span>}
          </div>
        </div>

        <div className="problem-solving-layout">
          <section className="problem-details-panel" aria-labelledby="problem-title">
            <div className="problem-details-tabs" aria-label="Problem sections">
              <span className="is-active"><Sparkles size={15} aria-hidden="true" /> Description</span>
              <Link href="/submissions"><ClipboardList size={15} aria-hidden="true" /> Submissions</Link>
              <button type="button" disabled title="Solutions are coming soon">
                <Sparkles size={15} aria-hidden="true" /> Solutions
              </button>
              <button type="button" disabled title="Discussion is coming soon">
                <MessageSquareText size={15} aria-hidden="true" /> Discussion
              </button>
              <button type="button" disabled title="Notes are coming soon">
                <NotebookPen size={15} aria-hidden="true" /> Notes
              </button>
            </div>
            <div className="problem-details-content">
              <div className="problem-title-row">
                <div>
                  <div className="problem-id-label">{problem.id}</div>
                  <h1 id="problem-title">{problem.title}</h1>
                </div>
                <span className={`problem-difficulty is-${problem.difficulty.toLowerCase()}`}>
                  {problem.difficulty}
                </span>
              </div>
              <div className="problem-topic-tags">
                {problem.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <div className="problem-description-block">
                <h2>Problem statement</h2>
                <p>{problem.description}</p>
              </div>
              <div className="problem-description-block">
                <h3>Input</h3>
                <p>{problem.inputFormat ?? "Input array and target value."}</p>
              </div>
              <div className="problem-description-block">
                <h3>Output</h3>
                <p>{problem.outputFormat ?? "Return the indices of the two numbers that add up to the target."}</p>
              </div>
              {[
                ...(problem.sampleInput !== undefined && problem.sampleOutput !== undefined
                  ? [{ input: problem.sampleInput, expected: problem.sampleOutput }]
                  : []),
                ...(problem.publicTestCases ?? []),
              ].filter((example, index, examples) =>
                examples.findIndex(({ input, expected }) => input === example.input && expected === example.expected) === index,
              ).map((example, index) => (
                <div className="problem-example-card" key={`${index}-${example.input}`}>
                  <h3>Example {index + 1}</h3>
                  <p><strong>Input:</strong> <code>{example.input}</code></p>
                  <p><strong>Output:</strong> <code>{example.expected}</code></p>
                </div>
              ))}
              <div className="problem-constraints-card">
                <h3>Constraints</h3>
                <p>{problem.constraints ?? "2 ≤ nums.length ≤ 10^4"}</p>
              </div>
            </div>
          </section>

          <CodeWorkspace
            key={problem.slug}
            problemSlug={problem.slug}
            starterCode={problem.starterCode}
            sampleInput={problem.sampleInput}
            sampleOutput={problem.sampleOutput}
            judgeable={Boolean(problem.testCaseCount)}
            supportedLanguages={problem.supportedLanguages}
            starterCodes={problem.starterCodes}
          />
        </div>
      </main>
    </PortalShell>
  );
}
