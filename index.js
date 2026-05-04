require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const { Octokit } = require("@octokit/rest");

const {
  ANTHROPIC_API_KEY,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
} = process.env;

if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill in: " +
      "ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO"
  );
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function fetchPullRequestDiff(pullNumber) {
  const { data } = await octokit.pulls.get({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    pull_number: pullNumber,
    mediaType: { format: "diff" },
  });
  return data;
}

async function reviewDiff(diff) {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    system:
      "You are a senior code reviewer. Given a unified diff, return concise, " +
      "actionable feedback: bugs, security issues, and clear improvements. " +
      "Skip nitpicks. Reference file paths and line numbers when possible.",
    messages: [
      {
        role: "user",
        content: `Review the following pull request diff:\n\n${diff}`,
      },
    ],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function main() {
  const pullNumber = Number(process.argv[2]);
  if (!pullNumber) {
    console.error("Usage: node index.js <pull_request_number>");
    process.exit(1);
  }

  console.log(`Fetching PR #${pullNumber} from ${GITHUB_OWNER}/${GITHUB_REPO}...`);
  const diff = await fetchPullRequestDiff(pullNumber);

  console.log("Sending to Claude for review...\n");
  const review = await reviewDiff(diff);

  console.log("--- Review ---\n");
  console.log(review);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
