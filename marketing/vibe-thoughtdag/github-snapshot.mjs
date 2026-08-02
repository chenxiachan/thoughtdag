#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repo = 'chenxiachan/thoughtdag'

function gh(endpoint, extraArgs = []) {
  const result = spawnSync('gh', ['api', ...extraArgs, endpoint], {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return JSON.parse(result.stdout)
}

const repository = gh(`repos/${repo}`)
const views = gh(`repos/${repo}/traffic/views`)
const clones = gh(`repos/${repo}/traffic/clones`)
const referrers = gh(`repos/${repo}/traffic/popular/referrers`)
const paths = gh(`repos/${repo}/traffic/popular/paths`)
const stargazers = gh(
  `repos/${repo}/stargazers?per_page=100`,
  ['--paginate', '--slurp', '-H', 'Accept: application/vnd.github.star+json'],
).flat()

const snapshot = {
  capturedAt: new Date().toISOString(),
  repository: {
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    subscribers: repository.subscribers_count,
    openIssuesAndPulls: repository.open_issues_count,
  },
  traffic: {
    views,
    clones,
    referrers,
    popularPaths: paths,
  },
  stars: {
    count: stargazers.length,
    byDay: Object.entries(
      stargazers.reduce((days, item) => {
        const day = item.starred_at.slice(0, 10)
        days[day] = (days[day] ?? 0) + 1
        return days
      }, {}),
    ).map(([day, count]) => ({ day, count })),
    timeline: stargazers.map((item) => ({
      starredAt: item.starred_at,
      user: item.user.login,
    })),
  },
}

const formatted = `${JSON.stringify(snapshot, null, 2)}\n`

if (process.argv.includes('--write')) {
  const outputDir = resolve(scriptDir, 'snapshots')
  mkdirSync(outputDir, { recursive: true })
  const filename = `${snapshot.capturedAt.replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')}.json`
  const outputPath = resolve(outputDir, filename)
  writeFileSync(outputPath, formatted)
  console.error(`Wrote ${outputPath}`)
}

process.stdout.write(formatted)
