/**
 * Preview one notification card without starting DSH.
 *
 *   node scripts/preview.mjs
 *   node scripts/preview.mjs --kind error --title "任务出错" --body "示例正文"
 *   node scripts/preview.mjs --dry-run
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const RENDERER = join(ROOT, 'lib', 'notify.ps1')

const PRESETS = {
  question: {
    kind: 'question',
    title: 'DSH 需要你的选择',
    body: '是否把这个插件提交到插件市场？\n选项：先提 GitHub / 同时发 npm',
    glyph: '?',
    accent: '#4D6BFE',
  },
  approval: {
    kind: 'approval',
    title: 'DSH 请求权限',
    body: '要执行 pnpm install 安装依赖，这会修改工作区的 node_modules。',
    glyph: '!',
    accent: '#F5A524',
  },
  completed: {
    kind: 'completed',
    title: '任务完成',
    body: '插件源码、README 和上传指南都写好了，等你检查。',
    glyph: '✓',
    accent: '#22C55E',
  },
  error: {
    kind: 'error',
    title: '任务出错',
    body: '模型返回了 400 invalid_request_error，回合已中止。',
    glyph: '✕',
    accent: '#EF4444',
  },
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    if (key === 'dry-run') {
      result[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value !== undefined && !value.startsWith('--')) {
      result[key] = value
      index += 1
    }
  }
  return result
}

const args = parseArgs(process.argv.slice(2))
const preset = PRESETS[args.kind] ?? PRESETS.question
const payload = {
  ...preset,
  title: args.title ?? preset.title,
  body: args.body ?? preset.body,
  meta: args.meta ?? '预览 · dsh-desktop-alerts',
  position: args.position ?? 'bottom-right',
  durationMs: Number.parseInt(args.duration ?? '8000', 10),
  sound: args.sound !== 'false',
  soundName: 'asterisk',
  clickAction: 'none',
  processName: 'DeepSeek Harness',
  stackIndex: 0,
}

if (args['dry-run']) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(0)
}

if (process.platform !== 'win32') {
  process.stderr.write('preview 只能在 Windows 上运行（需要 Windows PowerShell + WPF）。\n')
  process.exit(1)
}

const dir = join(tmpdir(), 'dsh-desktop-alerts')
await mkdir(dir, { recursive: true })
const payloadPath = join(dir, `preview-${Date.now()}.json`)
await writeFile(payloadPath, JSON.stringify(payload), 'utf8')

const root = process.env.SystemRoot || 'C:\\Windows'
const powershell = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const child = spawn(
  powershell,
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', RENDERER, '-Payload', payloadPath],
  { stdio: 'inherit', windowsHide: true },
)

child.on('exit', async (code) => {
  await rm(payloadPath, { force: true })
  process.exit(code ?? 0)
})
