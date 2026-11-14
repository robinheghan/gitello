import { execFileSync } from "node:child_process";

const prNumber = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY;
const apiKey = process.env.MISTRAL_API_KEY;

if (!prNumber || !repo || !apiKey) {
  console.error(
    "usage: node scripts/ai-review.mjs <pr-number> (requires GITHUB_REPOSITORY and MISTRAL_API_KEY)",
  );
  process.exit(1);
}

const model = process.env.REVIEW_MODEL ?? "mistral-large-latest";
const endpoint =
  process.env.REVIEW_ENDPOINT ?? "https://api.mistral.ai/v1/chat/completions";
const maxDiffLength = 120000;

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

const diff = gh("pr", "diff", prNumber, "--repo", repo);
const title = gh(
  "pr",
  "view",
  prNumber,
  "--repo",
  repo,
  "--json",
  "title",
  "--jq",
  ".title",
);
const body = gh(
  "pr",
  "view",
  prNumber,
  "--repo",
  repo,
  "--json",
  "body",
  "--jq",
  ".body",
);

const trimmedDiff =
  diff.length > maxDiffLength
    ? `${diff.slice(0, maxDiffLength)}\n... (diff truncated)`
    : diff;

const systemPrompt = [
  "You are an automated reviewer for a pull request in a small open-source repo.",
  "Review the diff for correctness, bugs, security issues, and consistency with the repository conventions.",
  "Be concise and constructive, in Markdown. If the change looks good, say so briefly.",
].join(" ");

const userPrompt = [
  `Pull request title: ${title}`,
  "",
  "Pull request description:",
  body || "(empty)",
  "",
  "Diff:",
  "```diff",
  trimmedDiff,
  "```",
].join("\n");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }),
});

const data = await response.json();
if (!response.ok) {
  console.error(
    `Review request failed with status ${response.status}:`,
    JSON.stringify(data),
  );
  process.exit(1);
}

let review = data.choices?.[0]?.message?.content;
if (Array.isArray(review)) {
  review = review
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}
if (!review) {
  console.error("Review response contained no content:", JSON.stringify(data));
  process.exit(1);
}

gh(
  "pr",
  "comment",
  prNumber,
  "--repo",
  repo,
  "--body",
  `## AI review (${model})\n\n${review}`,
);
console.log(`Posted AI review from ${model} on PR #${prNumber}`);
