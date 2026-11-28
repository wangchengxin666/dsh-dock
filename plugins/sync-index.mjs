#!/usr/bin/env node
/**
 * Generate plugins/index.json using Format-1 Git repository sources for DSH's
 * native Plugin Market (`git+https://github.com/<owner>/<repo>.git?path=plugins/index.json`).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGINS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = dirname(PLUGINS_DIR)

function parseArgs(argv) {
  const out = { commit: '', repo: 'https://github.com/wangchengxin666/dsh-dock' }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--commit' && argv[i + 1]) out.commit = argv[++i].trim().toLowerCase()
    else if (argv[i] === '--repo' && argv[i + 1]) out.repo = argv[++i].trim().replace(/\/+$/, '')
  }
  if (!out.commit) {
    out.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().toLowerCase()
  }
  if (!/^[0-9a-f]{40}$/.test(out.commit)) {
    throw new Error(`Invalid commit SHA (expected 40 lowercase hex): ${out.commit}`)
  }
  return out
}

const PLUGIN_SPECS = [
  { dir: 'custom-theme', category: 'appearance', labels: ['official'], sortOrder: 10 },
  { dir: 'file-manager', category: 'workspace', labels: ['official'], sortOrder: 20 },
  { dir: 'sandbox-memory', category: 'memory', labels: ['official', 'self-evolving'], sortOrder: 30 },
  { dir: 'app-gateway', category: 'gateway', labels: ['official'], sortOrder: 40 },
  { dir: 'webhook-triggers', category: 'automation', labels: ['official'], sortOrder: 50 },
  { dir: 'self-evolve', category: 'memory', labels: ['official', 'self-evolving'], sortOrder: 60 },
]

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function inlineSvgDataUrl(svgPath) {
  const svg = readFileSync(svgPath, 'utf8').trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

const { commit, repo } = parseArgs(process.argv.slice(2))
const nowSeconds = Math.floor(Date.now() / 1000)

const plugins = PLUGIN_SPECS.map((spec) => {
  const dirPath = join(PLUGINS_DIR, spec.dir)
  const pkg = readJson(join(dirPath, 'package.json'))
  const locEn = readJson(join(dirPath, 'locale', 'en.json'))
  const locZh = readJson(join(dirPath, 'locale', 'zh.json'))
  const enTitle = locEn.name || locEn.meta?.title || pkg.name
  const zhTitle = locZh.name || locZh.meta?.title || enTitle
  const enDesc = locEn.description || locEn.meta?.description || pkg.description
  const zhDesc = locZh.description || locZh.meta?.description || enDesc

  return {
    name: pkg.name,
    title: { en: enTitle, zh: zhTitle },
    description: { en: enDesc, zh: zhDesc },
    author: 'DSH Dock',
    homepage: `${repo}/tree/main/plugins/${spec.dir}`,
    icon: inlineSvgDataUrl(join(dirPath, 'icon.svg')),
    metadata: {
      category: spec.category,
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      labels: spec.labels,
      sortKeys: {
        updated: nowSeconds - spec.sortOrder,
        name: spec.sortOrder,
      },
    },
    versions: [
      {
        version: pkg.version,
        publishTimestamp: nowSeconds,
        engines: pkg.engines || { dsh: '>=0.2.0 <0.3.0' },
        source: {
          type: 'git',
          url: repo,
          commit,
          path: `plugins/${spec.dir}`,
        },
      },
    ],
  }
})

const indexDoc = {
  format: 1,
  title: {
    en: 'DSH Dock Built-in Plugins',
    zh: 'DSH Dock 工作台官方插件',
  },
  description: {
    en: 'Self-evolving workbench plugins fetched directly from GitHub via DSH Git market format.',
    zh: '支持自进化、Webhook 触发与网关应用暴露的官方 DSH 工作台插件索引（直接从 GitHub 拉取）。',
  },
  metadata: {
    categories: {
      appearance: { title: { en: 'Appearance & UI', zh: '界面与主题' } },
      workspace: { title: { en: 'Workspace & Files', zh: '工作区与文件' } },
      memory: { title: { en: 'Memory & Self-Evolution', zh: '记忆与自进化' } },
      gateway: { title: { en: 'Apps & Services', zh: '对外应用与服务' } },
      automation: { title: { en: 'Webhooks & Automation', zh: 'Webhook 与自动化' } },
    },
    labels: {
      official: { title: { en: 'Built-in', zh: '内置官方' } },
      'self-evolving': { title: { en: 'Self-Evolving', zh: '自进化能力' } },
    },
    sortKeys: {
      updated: { title: { en: 'Recently Updated', zh: '最近更新' }, order: 'desc' },
      name: { title: { en: 'Recommended', zh: '推荐顺序' }, order: 'asc' },
    },
  },
  plugins,
}

const outPath = join(PLUGINS_DIR, 'index.json')
writeFileSync(outPath, `${JSON.stringify(indexDoc, null, 2)}\n`, 'utf8')
console.log(`Generated ${outPath} (${plugins.length} Git plugins @ commit ${commit})`)
