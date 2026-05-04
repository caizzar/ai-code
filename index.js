require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const { Octokit } = require("@octokit/rest");

const {
  ANTHROPIC_API_KEY,
  GITHUB_TOKEN,
  REPO_OWNER,
  REPO_NAME,
  PR_NUMBER,
} = process.env;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const octokit = new Octokit({ auth: GITHUB_TOKEN });

const SYSTEM_PROMPT = `You are a senior engineer doing a thorough code review.
For each issue found, output a JSON array of objects with this shape:
{"severity":"critical"|"warning"|"info"|"security","file":"<filename>","line":<number or null>,"title":"<short title>","detail":"<explanation and fix>"}
Return ONLY the JSON array. No prose, no markdown fences.`;

async function run() {
  const owner = REPO_OWNER;
  const repo = REPO_NAME;
  const pr = parseInt(PR_NUMBER);

  const { data: diff } = await octokit.pulls.get({
    owner, repo, pull_number: pr,
    mediaType: { format: "diff" },
  });

  const message = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Review this diff:\n\n${diff}` }],
  });

  const issues = JSON.parse(message.content[0].text);
  const counts = { critical:0, warning:0, info:0, security:0 };
  issues.forEach(i => counts[i.severity]++);

  const badges = [
    counts.critical  ? `🔴 **${counts.critical} critical**`  : null,
    counts.security  ? `🔐 **${counts.security} security**`  : null,
    counts.warning   ? `🟡 ${counts.warning} warning`        : null,
    counts.info      ? `🔵 ${counts.info} info`              : null,
  ].filter(Boolean).join("  ·  ");

  const sections = issues.map(i => {
    const icon = {critical:"🔴",warning:"🟡",info:"🔵",security:"🔐"}[i.severity];
    return `### ${icon} ${i.title}\n**\`${i.file}${i.line ? `:${i.line}` : ""}\`**\n\n${i.detail}`;
  }).join("\n\n---\n\n");

  const body = `## AI Code Review — Opus 4.7\n\n${badges}\n\n---\n\n${sections}\n\n---\n*Powered by Claude Opus 4.7*`;

  await octokit.issues.createComment({
    owner, repo, issue_number: pr, body,
  });

  console.log(`Done — ${issues.length} issues posted.`);
}

run().catch(err => { console.error(err); process.exit(1); });
