#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const campaignPath = resolve(scriptDir, 'campaign.json')
const campaign = JSON.parse(readFileSync(campaignPath, 'utf8'))

const args = new Set(process.argv.slice(2))
const shouldCreate = args.has('--create-drafts')
const requestedIdIndex = process.argv.indexOf('--post')
const requestedId = requestedIdIndex >= 0 ? process.argv[requestedIdIndex + 1] : null

const integrationEnv = {
  x: 'POSTIZ_INTEGRATION_X',
  bluesky: 'POSTIZ_INTEGRATION_BLUESKY',
  linkedin: 'POSTIZ_INTEGRATION_LINKEDIN',
}

const posts = requestedId
  ? campaign.posts.filter((post) => post.id === requestedId)
  : campaign.posts.filter((post) => post.delivery === 'postiz-draft')

if (requestedId && posts.length === 0) {
  console.error(`Unknown campaign post: ${requestedId}`)
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return options.capture ? result.stdout.trim() : ''
}

function scheduledAt() {
  if (process.env.POSTIZ_DRAFT_DATE) return process.env.POSTIZ_DRAFT_DATE
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 7)
  date.setUTCHours(12, 0, 0, 0)
  return date.toISOString()
}

function printPost(post) {
  const envName = integrationEnv[post.channel]
  console.log(`\n[${post.status}] ${post.id}`)
  console.log(`channel: ${post.channel}`)
  console.log(`delivery: ${post.delivery}`)
  console.log(`integration: ${envName ?? 'manual'}`)
  console.log(`media: ${post.media.join(', ')}`)
  if (post.title) console.log(`\n--- title ---\n${post.title}`)
  post.content.forEach((item, index) => {
    console.log(`\n--- part ${index + 1} ---\n${item}`)
  })
}

function uploadFirstMedia(post) {
  if (!post.media?.length) return null
  const mediaPath = resolve(repoRoot, post.media[0])
  if (!existsSync(mediaPath)) {
    console.error(`Missing media: ${mediaPath}`)
    process.exit(1)
  }

  const output = run('postiz', ['upload', mediaPath], { capture: true })
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch {
    console.error(`Could not parse Postiz upload response:\n${output}`)
    process.exit(1)
  }

  const path = parsed.path ?? parsed.url ?? parsed.data?.path
  if (!path) {
    console.error(`Postiz upload response has no path:\n${output}`)
    process.exit(1)
  }
  return path
}

for (const post of posts) printPost(post)

if (!shouldCreate) {
  console.log('\nDry run only. Use --create-drafts after the second-wave gate is met.')
  console.log('Community posts such as Reddit remain manual by design.')
  process.exit(0)
}

if (posts.some((post) => post.delivery !== 'postiz-draft')) {
  console.error('Refusing to create a community post through Postiz. Publish it manually after review.')
  process.exit(1)
}

run('postiz', ['auth:status'])

for (const post of posts) {
  if (post.status !== 'ready' && process.env.POSTIZ_GATE_OVERRIDE !== '1') {
    console.error(
      `Refusing to create ${post.id}: status is "${post.status}". ` +
      'Meet the campaign gate or set POSTIZ_GATE_OVERRIDE=1 after human review.',
    )
    process.exit(1)
  }

  const envName = integrationEnv[post.channel]
  const integrationId = process.env[envName]
  if (!integrationId) {
    console.error(`Missing ${envName}. Run "postiz integrations:list" and export the matching ID.`)
    process.exit(1)
  }

  const mediaPath = uploadFirstMedia(post)
  const commandArgs = ['posts:create']
  const pieces = post.format === 'single' ? [post.content.join('\n\n')] : post.content
  pieces.forEach((content, index) => {
    commandArgs.push('-c', content)
    if (index === 0 && mediaPath) commandArgs.push('-m', mediaPath)
  })
  commandArgs.push('-s', scheduledAt(), '-t', 'draft', '-i', integrationId)

  run('postiz', commandArgs)
}

console.log('\nDrafts created. Review them in Postiz before changing any draft to scheduled.')
