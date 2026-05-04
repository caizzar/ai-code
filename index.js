require("dotenv").config();
const { Octokit } = require("@octokit/rest");

const { DEEPSEEK_API_KEY, GITHUB_TOKEN, REPO_OWNER, REPO_NAME, PR_NUMBER } = process.env;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function run() {
  const owner = REPO_OWNER;
  const repo = REPO_NAME;
  const pr = parseInt(PR_NUMBER);

  const { data: diff } = await octokit.pulls.get({
    owner, repo, pull_number: pr,
    mediaType: { format: "diff" },
  });

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: `You are a senior engineer doing a thorough code review. For each issue found, output a JSON array: [{"severity":"critical"|"warning"|"info"|"security","file":"filename","line":null,"title":"short title","detail":"explanation"}]. Return ONLY the JSON array, no markdown, no backticks.` },
        { role: "user", content: `Review this diff:\n\n${String(diff).slice(0, 8000)}` }
      ],
    }),
  });

  const data = await response.json();
  console.log("DeepSeek response:", JSON.stringify(data, null, 2));

  if (!data.choices || !data.choices[0]) {
    throw new Error("No response from DeepSeek: " + JSON.stringify(data));
  }

  let issues;
  try {
    const text = data.choices[0].message.content.replace(/```json|```/g, "").trim();
    issues = JSON.parse(text);
  } catch(e) {
    issues = [{ severity: "info", file: "general", line: null, title: "Review complete", detail: data.choices[0].message.content }];
  }

  const counts = { critical:0, warning:0, info:0, security:0 };
  issues.forEach(i => counts[i.severity]++);

  const badges = [
    counts.critical ? `🔴 **${counts.critical} critical**` : null,
    counts.security ? `🔐 **${counts.security} security**` : null,
    counts.warning  ? `🟡 ${counts.warning} warning`       : null,
    counts.info     ? `🔵 ${counts.info} info`             : null,
  ].filter(Boolean).join("  ·  ");

  const sections = issues.map(i => {
    const icon = {critical:"🔴",warning:"🟡",info:"🔵",security:"🔐"}[i.severity] || "🔵";
    return `### ${icon} ${i.title}\n**\`${i.file}${i.line ? `:${i.line}` : ""}\`**\n\n${i.detail}`;
  }).join("\n\n---\n\n");

  const body = `## AI Code Review — DeepSeek\n\n${badges}\n\n---\n\n${sections}\n\n---\n*Powered by DeepSeek AI*`;

  await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
  console.log(`Done — ${issues.length} issues posted.`);
}

run().catch(err => { console.error(err); process.exit(1); });
