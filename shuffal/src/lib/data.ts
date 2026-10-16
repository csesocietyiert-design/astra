export type Difficulty = "Easy" | "Medium" | "Hard";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  tags: string[];
  status: "Solved" | "Attempted" | "Unsolved";
  acceptance: number;
  description: string;
  topic: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string;
  sampleInput?: string;
  sampleOutput?: string;
  publicTestCases?: Array<{ input: string; expected: string }>;
  starterCode?: string;
  testCaseCount?: number;
  supportedLanguages?: number[];
  starterCodes?: Record<string, string>;
  timeLimitMs?: number;
  memoryLimitMb?: number;
};

export const problems: Problem[] = [
  {
    id: "AST-101",
    title: "Two Sum",
    slug: "two-sum",
    difficulty: "Easy",
    tags: ["arrays", "hash-map"],
    status: "Solved",
    acceptance: 71,
    description: "Return the indices of two numbers that add up to a target value.",
    topic: "Arrays",
  },
  {
    id: "AST-207",
    title: "Longest Substring Without Repeating Characters",
    slug: "longest-substring-without-repeating-characters",
    difficulty: "Medium",
    tags: ["strings", "sliding-window"],
    status: "Attempted",
    acceptance: 39,
    description: "Find the length of the longest substring without repeating characters.",
    topic: "Strings",
    inputFormat: "A string s, provided on a single line.",
    outputFormat: "Print the length of the longest substring of s that contains no repeating characters.",
    constraints: "0 ≤ s.length ≤ 5 × 10^4",
    sampleInput: "abcabcbb",
    sampleOutput: "3",
    starterCode: `import sys

def length_of_longest_substring(s):
    last_seen = {}
    window_start = 0
    longest = 0

    for index, char in enumerate(s):
        if char in last_seen and last_seen[char] >= window_start:
            window_start = last_seen[char] + 1
        last_seen[char] = index
        longest = max(longest, index - window_start + 1)

    return longest

s = sys.stdin.readline().rstrip("\\r\\n")
print(length_of_longest_substring(s))
`,
  },
  {
    id: "AST-312",
    title: "Median of Two Sorted Arrays",
    slug: "median-of-two-sorted-arrays",
    difficulty: "Hard",
    tags: ["binary-search", "divide-and-conquer"],
    status: "Unsolved",
    acceptance: 33,
    description: "Determine the median of two sorted arrays in O(log n) time.",
    topic: "Search",
  },
  {
    id: "AST-154",
    title: "Valid Parentheses",
    slug: "valid-parentheses",
    difficulty: "Easy",
    tags: ["stack", "strings"],
    status: "Solved",
    acceptance: 79,
    description: "Check whether a string of parentheses is valid.",
    topic: "Stacks",
  },
  {
    id: "AST-283",
    title: "Merge Intervals",
    slug: "merge-intervals",
    difficulty: "Medium",
    tags: ["sorting", "intervals"],
    status: "Attempted",
    acceptance: 51,
    description: "Merge overlapping intervals into a minimal set of non-overlapping intervals.",
    topic: "Sorting",
  },
  {
    id: "AST-418",
    title: "Word Ladder",
    slug: "word-ladder",
    difficulty: "Hard",
    tags: ["graph", "bfs"],
    status: "Unsolved",
    acceptance: 29,
    description: "Find the shortest transformation sequence between two words.",
    topic: "Graph",
  },
];
