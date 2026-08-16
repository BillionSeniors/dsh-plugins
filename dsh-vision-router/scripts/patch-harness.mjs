#!/usr/bin/env node
/**
 * patch-harness.mjs — 把「模型页企业级编辑器」补丁应用到 DSH 核心
 *
 * dsh-vision-router 的模型页（设置 → 模型 → 视觉路由 → 编辑）企业级界面，
 * 需要给核心包 @deepseek-ai/dsh-client-ui-settings-models 打一个补丁文件。
 * 本脚本自动发现本机所有 DSH 部署（Web / 桌面端 / profile 池）并安全应用：
 *
 *   1. 只处理与「已发布基线」逐字节一致的核心文件（版本不匹配会跳过并提示，
 *      绝不破坏你的安装）；
 *   2. 打补丁前自动备份原文件为 client.js.orig-bak（已有备份则跳过）；
 *   3. --check 只检查不修改；
 *   4. --target <文件路径> 手动指定要打补丁的核心文件（桌面端等自定义位置）。
 *
 * 用法：
 *   node scripts/patch-harness.mjs            # 自动发现并打补丁
 *   node scripts/patch-harness.mjs --check    # 检查各部署的补丁状态
 *   node scripts/patch-harness.mjs --target <path>   # 指定文件
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url)) // <repo>/scripts
const ROOT = resolve(HERE, '..') // <repo>
const PATCHED = join(ROOT, 'patches', 'dsh-client-ui-settings-models.client.js')
// 原始（未补丁）基线：发布时对应 @deepseek-ai/dsh-client-ui-settings-models 0.1.0-rc.6
const BASELINE_ORIG = '801c380dc7904d30e3ba94a0cb8e4759'
// 补丁文件自身哈希：已打过补丁的部署直接跳过
const PATCHED_HASH = '6203dc329f01b63656c1c6e7eff6e00b'
// 历史补丁哈希：匹配到旧补丁的部署也应升级到当前补丁（覆盖写入）
const OLD_PATCHED_HASHES = ['06b8fc14bae827ddbb07aeecb6fd584d']

const flag = (name) => {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}
const has = (name) => process.argv.includes(name)
const md5 = (buf) => createHash('md5').update(buf).digest('hex')

/** 自动发现的候选核心文件路径。 */
function candidates() {
  const list = []
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  const rel = join('@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
  // 1) DSH home 的 profile 池与各 profile（web / desktop / 其他）
  const pool = join(home, 'profiles', 'node_modules', rel)
  const profs = join(home, 'profiles')
  if (existsSync(pool)) list.push(pool)
  if (existsSync(profs)) {
    for (const name of ['web', 'desktop']) {
      const p = join(profs, name, 'node_modules', rel)
      if (existsSync(p)) list.push(p)
    }
  }
  // 2) 运行中的 dsh CLI 自带核心（<DSH_HOME>/../tools/node/node_modules/@deepseek-ai/dsh/...）
  const cli = join(dirname(home), 'tools', 'node', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
  if (existsSync(cli) && !list.includes(cli)) list.push(cli)
  // 3) 插件被安装在某个 profile 的 node_modules 里时，向上一两级找 @deepseek-ai 池
  for (let up = 0; up < 3; up++) {
    const base = up === 0 ? dirname(ROOT) : up === 1 ? dirname(dirname(ROOT)) : dirname(dirname(dirname(ROOT)))
    const p = join(base, '@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
    if (existsSync(p) && !list.includes(p)) list.push(p)
  }
  // 4) --scan-root 附加扫描根（可重复）
  let i = process.argv.indexOf('--scan-root')
  while (i !== -1 && i + 1 < process.argv.length) {
    const root = process.argv[i + 1]
    for (const p of [
      join(root, 'node_modules', rel),
      join(root, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js'),
    ]) {
      if (existsSync(p) && !list.includes(p)) list.push(p)
    }
    i = process.argv.indexOf('--scan-root', i + 1)
  }
  return list
}

function statusOf(file) {
  if (!existsSync(file)) return null
  const h = md5(readFileSync(file))
  if (h === PATCHED_HASH) return 'patched'
  if (OLD_PATCHED_HASHES.includes(h)) return 'old-patched'
  if (h === BASELINE_ORIG) return 'original'
  return 'unknown'
}

function patchFile(file) {
  const status = statusOf(file)
  if (status === null) return { file, result: 'missing' }
  if (status === 'patched') return { file, result: 'already-patched' }
  if (status === 'unknown') return { file, result: 'version-mismatch' }
  const backup = file + '.orig-bak'
  if (!existsSync(backup)) {
    copyFileSync(file, backup)
  }
  writeFileSync(file, readFileSync(PATCHED))
  return { file, result: status === 'old-patched' ? 'upgraded' : 'patched' }
}

const only = flag('--target')
const checkOnly = has('--check')

if (!existsSync(PATCHED)) {
  console.error(`patch-harness: 找不到补丁文件: ${PATCHED}`)
  process.exit(1)
}

const targets = only ? [only] : candidates()
if (targets.length === 0) {
  console.log('patch-harness: 未发现任何 DSH 核心文件（可加 --target <路径> 手动指定）')
  process.exit(0)
}

let changed = 0
for (const file of targets) {
  const out = checkOnly ? { file, result: statusOf(file) ?? 'missing' } : patchFile(file)
  if (out.result === 'patched' || out.result === 'upgraded') changed++
  const label = {
    patched: '✅ 已打补丁',
    upgraded: '🔄 已从旧补丁升级',
    'already-patched': '⏭ 已是补丁版（跳过）',
    original: '🟡 原始版（待打补丁）',
    'version-mismatch': '⚠️ 版本与补丁基线不一致（跳过，避免破坏）',
    unknown: '⚠️ 未知版本（跳过，避免破坏）',
    missing: '— 不存在（跳过）',
  }[out.result]
  console.log(`${label}  ${out.file}`)
}
if (checkOnly) {
  console.log(changed > 0 ? '' : 'check 完成：未修改任何文件。')
}
