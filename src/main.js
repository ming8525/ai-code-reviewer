const { readFileSync } = require("fs")
const core = require("@actions/core")
const OpenAI = require("openai")
const { Octokit } = require("@octokit/rest")
const parseDiff = require("parse-diff")
const { minimatch } = require('minimatch')


const GITHUB_TOKEN = core.getInput("GITHUB_TOKEN")
const OPENAI_API_KEY = core.getInput("OPENAI_API_KEY")
const OPENAI_API_MODEL = core.getInput("OPENAI_API_MODEL")
const EXCLUDE_FILES = core.getInput("EXCLUDE_FILES")
const MAX_ALLOWED_LINES = core.getInput("MAX_ALLOWED_LINES")
const MAX_RETURNED_COMMENTS = core.getInput("MAX_RETURNED_COMMENTS")

const octokit = new Octokit({ auth: GITHUB_TOKEN })

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})


async function getPRDetails() {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
  )
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  })
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
  }
}

async function getDiff(owner, repo, pull_number) {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  })
  return response.data
}

async function analyzeCode(
  parsedDiff,
  prDetails,
  maxComments
) {
  const comments = []

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue // Ignore deleted files
    for (const chunk of file.chunks) {
      const prompt = createPrompt(file, chunk, prDetails, maxComments)
      const aiResponse = await getAIResponse(prompt)
      if (aiResponse) {
        const newComments = createComment(file, chunk, aiResponse)
        if (newComments) {
          comments.push(...newComments)
        }
      }
    }
  }
  return comments
}

function createPrompt(file, chunk, prDetails, maxComments = 10) {
  return `Your task is to review pull requests. Instructions:
- Provide the response in following JSON format:  {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment the code.
- If there are more than ${maxComments} comments, prioritize the most critical ones and return only the top ${maxComments}.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${file.to
    }" and take the pull request title and description into account when writing the response.
  
Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:

\`\`\`diff
${chunk.content}
${chunk.changes
      .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
      .join("\n")}
\`\`\`
`
}

async function getAIResponse(prompt) {
  const queryConfig = {
    model: OPENAI_API_MODEL,
    temperature: 0.2,
    max_tokens: 700,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  }

  try {
    const response = await openai.chat.completions.create({
      ...queryConfig,
      // return JSON if the model supports it:
      ...(OPENAI_API_MODEL === "gpt-4-1106-preview"
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    })

    const res = response.choices[0].message?.content?.trim() || "{}"
    return JSON.parse(res).reviews
  } catch (error) {
    console.error("Error:", error)
    return null
  }
}

function createComment(
  file,
  chunk,
  aiResponses
) {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) {
      return []
    }
    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    }
  })
}

async function createReviewComment(
  owner,
  repo,
  pull_number,
  comments
) {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    comments,
    event: "COMMENT",
  })
}

async function main() {
  const prDetails = await getPRDetails()

  const isFormattingPR = /format|prettier|style/i.test(prDetails.title) ||
    /format|prettier|style/i.test(prDetails.description);

  if (isFormattingPR) {
    console.log("Skipping review: This PR appears to be only code formatting.");
    return;
  }

  let diff
  const eventData = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
  )

  if (eventData.action === "opened") {
    diff = await getDiff(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number
    )
  } else if (eventData.action === "synchronize") {
    const newBaseSha = eventData.before
    const newHeadSha = eventData.after

    const response = await octokit.repos.compareCommits({
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
      owner: prDetails.owner,
      repo: prDetails.repo,
      base: newBaseSha,
      head: newHeadSha,
    })

    diff = String(response.data)
  } else {
    console.log("Unsupported event:", process.env.GITHUB_EVENT_NAME)
    return
  }

  if (!diff) {
    console.log("No diff found")
    return
  }

  const parsedDiff = parseDiff(diff)

  const excludePatterns = EXCLUDE_FILES.split(",")
    .map((s) => s.trim())

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    )
  })

  const changedLines = filteredDiff.reduce((total, file) => {
    return total + file.chunks.reduce((chunkTotal, chunk) => {
      return chunkTotal + chunk.changes.length
    }, 0)
  }, 0)

  if (changedLines > (MAX_ALLOWED_LINES || 200)) {
    console.log(`Skipping review: PR contains ${changedLines} changed lines, which exceeds the limit of ${MAX_ALLOWED_LINES}.`)

    await octokit.issues.createComment({
      owner: prDetails.owner,
      repo: prDetails.repo,
      issue_number: prDetails.pull_number,
      body: `⚠️ This PR contains **${changedLines}** changed lines, exceeding the limit of **${MAX_ALLOWED_LINES}** for automated review. Please consider breaking it into smaller PRs for better review.`
    })

    return
  }

  const comments = await analyzeCode(filteredDiff, prDetails, MAX_RETURNED_COMMENTS)
  if (comments.length > 0) {
    await createReviewComment(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
      comments
    )
  }
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})