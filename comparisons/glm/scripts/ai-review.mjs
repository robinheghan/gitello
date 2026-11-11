#!/usr/bin/env node

// Fetch the PR title, description and diff, ask the Mistral chat API
// for a review, and post it as a "## AI review" PR comment.
// Model and endpoint are configurable via REVIEW_MODEL / REVIEW_ENDPOINT.

import { spawnSync } from 'node:child_process';

const DEFAULT_MODEL = 'mistral-large-latest';
const DEFAULT_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
const MAX_DIFF_LENGTH = 120_000;

function prNumber() {
  const ref = process.env.GITHUB_REF ?? '';
  const match = ref.match(/^refs\/pull\/(\d+)\/(merge|head)$/);
  return match ? match[1] : null;
}

function run(cmd, args, input = undefined) {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8', input });
    return {
      ok: result.status === 0 && result.error === undefined,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: String(err) };
  }
}

async function main() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('MISTRAL_API_KEY is not set, skipping AI review.');
    return 0;
  }
  const number = prNumber();
  if (!number) {
    console.log('Not running on a pull request, skipping AI review.');
    return 0;
  }

  const view = run('gh', ['pr', 'view', number, '--json', 'title,body']);
  if (!view.ok) {
    console.error(`could not fetch pull request: ${view.stderr}`);
    return 1;
  }
  let pr;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    console.error('could not parse pull request data.');
    return 1;
  }

  const diffResult = run('gh', ['pr', 'diff', number]);
  if (!diffResult.ok) {
    console.error(`could not fetch pull request diff: ${diffResult.stderr}`);
    return 1;
  }
  const diff = diffResult.stdout.slice(0, MAX_DIFF_LENGTH);
  if (diff.length < diffResult.stdout.length) {
    console.log(`diff truncated at ${MAX_DIFF_LENGTH} characters.`);
  }

  const response = await fetch(
    process.env.REVIEW_ENDPOINT || DEFAULT_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.REVIEW_MODEL || DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a meticulous code reviewer. Review the pull request described below. Focus on correctness, security, error handling and testability. Be concise and concrete; only report real issues, no praise.',
          },
          {
            role: 'user',
            content: [
              `Pull request title: ${pr.title ?? ''}`,
              '',
              'Pull request description:',
              pr.body ?? '',
              '',
              'Pull request diff:',
              diff,
            ].join('\n'),
          },
        ],
      }),
    },
  );
  if (!response.ok) {
    console.error(
      `review request failed: ${response.status} ${await response.text()}`,
    );
    return 1;
  }
  const data = await response.json();
  const review = data.choices?.[0]?.message?.content?.trim();
  if (!review) {
    console.error('the review model returned no content.');
    return 1;
  }

  const comment = `## AI review\n\n${review}\n`;
  const posted = run('gh', ['pr', 'comment', number, '--body', comment]);
  if (!posted.ok) {
    console.error(`could not post review comment: ${posted.stderr}`);
    return 1;
  }
  console.log('AI review posted.');
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(`AI review failed: ${err?.stack ?? err}`);
    process.exit(1);
  });
