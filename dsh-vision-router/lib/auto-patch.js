// auto-patch.js — 模型页「企业级编辑器」核心补丁的自动应用器
//
// dsh-vision-router 的模型页（设置 → 模型 → 视觉路由 → 编辑）企业级界面，
// 需要给核心包 @deepseek-ai/dsh-client-ui-settings-models 打一个补丁文件。
// 本模块在插件加载时自动运行（apply() 里 setImmediate 触发），无需用户执行
// 任何命令。安全约束与 scripts/patch-harness.mjs 完全一致：
//
//   1. 只处理与「已发布基线」逐字节一致的核心文件（版本不匹配会跳过并提示，
//      绝不破坏安装）；
//   2. 打补丁前自动备份原文件为 client.js.orig-bak（已有备份则跳过）；
//   3. 幂等：已是补丁版则跳过；任何失败都只记录日志，绝不让插件启动失败。
//
// 自动发现的部署：DSH_HOME 的 profile 池 / web / desktop、CLI 自带核心、
// 以及插件自身安装位置向上（覆盖桌面端 app.asar.unpacked\node_modules）。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url)) // <plugin>/lib
const ROOT = dirname(HERE) // <plugin>
const PATCHED = join(ROOT, 'patches', 'dsh-client-ui-settings-models.client.js')
// 原始（未补丁）基线：发布时对应 @deepseek-ai/dsh-client-ui-settings-models 0.1.0-rc.6
const BASELINE_ORIG = '801c380dc7904d30e3ba94a0cb8e4759'
// 补丁文件自身哈希：已打过补丁的部署直接跳过
const PATCHED_HASH = '6203dc329f01b63656c1c6e7eff6e00b'
// 历史补丁哈希：匹配到旧补丁的部署也应升级到当前补丁（覆盖写入）
const OLD_PATCHED_HASHES = ['06b8fc14bae827ddbb07aeecb6fd584d']

const md5 = (buf) => createHash('md5').update(buf).digest('hex')

/** 单个核心文件的状态。 */
function statusOf(file) {
  if (!existsSync(file)) return null
  const h = md5(readFileSync(file))
  if (h === PATCHED_HASH) return 'patched'
  if (OLD_PATCHED_HASHES.includes(h)) return 'old-patched'
  if (h === BASELINE_ORIG) return 'original'
  return 'unknown'
}

/** 自动发现的候选核心文件路径（与 patch-harness.mjs 保持一致的发现范围）。 */
function candidates() {
  const list = []
  const rel = join('@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
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
  // 3) 从插件自身安装位置向上找 @deepseek-ai 池：
  //    - 桌面端: <app>\resources\app.asar.unpacked\node_modules\dsh-vision-router
  //    - Web:    <DSH_HOME>\profiles\web\node_modules\dsh-vision-router
  //    - 池:     <DSH_HOME>\profiles\node_modules\dsh-vision-router
  let level = ROOT
  for (let up = 0; up < 6; up++) {
    for (const p of [join(level, rel), join(level, 'node_modules', rel)]) {
      if (existsSync(p) && !list.includes(p)) list.push(p)
    }
    level = dirname(level)
  }
  return list
}

/**
 * 自动应用补丁（幂等）。返回本次实际打补丁的文件数；任何异常都不会向外抛出。
 * @param {(msg: string) => void} [log]
 */
export function autoApplyCorePatch(log) {
  const say = log || ((msg) => { try { console.log(msg) } catch { /* ignore */ } })
  if (!existsSync(PATCHED)) {
    say('[vision-router] 自动补丁：补丁文件缺失，跳过（不影响插件运行）')
    return 0
  }
  let changed = 0
  for (const file of candidates()) {
    const status = statusOf(file)
    if (status === null) continue
    if (status === 'patched') continue
    if (status === 'unknown') {
      say(`[vision-router] 自动补丁：${file} 与基线不一致，跳过（避免破坏）`)
      continue
    }
    try {
      const backup = file + '.orig-bak'
      if (!existsSync(backup)) copyFileSync(file, backup)
      writeFileSync(file, readFileSync(PATCHED))
      changed++
      say(status === 'old-patched'
        ? `[vision-router] 已把旧补丁升级为最新版 → ${file}`
        : `[vision-router] 已自动应用「模型页企业级编辑器」补丁 → ${file}`)
    } catch (err) {
      say(`[vision-router] 自动补丁失败：${file} — ${err?.message || err}`)
    }
  }
  return changed
}

export { BASELINE_ORIG, PATCHED_HASH }
