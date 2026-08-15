#!/usr/bin/env node
/**
 * install.mjs —— 一键安装 dsh-project-file-explorer 到本机 dsh
 *
 * 在目标电脑上（已安装 DeepSeek Harness）运行：
 *   node scripts/install.mjs
 *
 * 脚本自动完成：
 *   1. 把插件文件复制到 ~/.dsh/profiles/node_modules/@local/dsh-project-file-explorer/
 *   2. 在 ~/.dsh/profiles/web/cordis.patch.yml 注册插件（已注册则跳过，幂等）
 *   3. 应用 harness 补丁（workspace 未分组删除 + layout 响应式），已打过自动跳过
 *   4. 提示重启 dsh web
 *
 * 可选参数：
 *   --profile <dir>   指定 dsh profile 目录（默认 ~/.dsh/profiles/web）
 *   --target <dir>    指定 @deepseek-ai 依赖目录（传给 patch-harness.mjs）
 *   --skip-patch      跳过补丁步骤（只复制 + 注册）
 *
 * 卸载：删除 @local/dsh-project-file-explorer 目录，并从 cordis.patch.yml
 * 移除对应 insert 条目即可。
 */
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/scripts
const ROOT = resolve(HERE, ".."); // <repo>
// dsh 数据根目录：优先 $DSH_HOME（支持自定义安装位置），否则默认 ~/.dsh
const home = (process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"));

// ---- 参数解析 ----
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
};
const profileDir = flag("--profile") ? resolve(flag("--profile")) : join(home, "profiles", "web");
const explicitTarget = flag("--target") ? resolve(flag("--target")) : null;
const skipPatch = process.argv.includes("--skip-patch");

// ---- 路径推导 ----
// 插件位于 profiles/node_modules/@local/dsh-project-file-explorer
// （web profile 的上级 profiles 下的 node_modules，与 profile 平级）
const localRoot = join(dirname(profileDir), "node_modules", "@local");
const pluginDir = join(localRoot, "dsh-project-file-explorer");
const patchYml = join(profileDir, "cordis.patch.yml");

const pluginName = "dsh-project-file-explorer";
const patchYmlBlock =
  "\n- insert:\n" +
  "    - id: project-file-explorer\n" +
  "      name: '@local/dsh-project-file-explorer'\n";

// ---- ① 复制插件 ----
console.log(`== 安装插件到： ${pluginDir}`);
mkdirSync(pluginDir, { recursive: true });
for (const entry of ["lib", "scripts", "example", "package.json", "README.md", "LICENSE"]) {
  const src = join(ROOT, entry);
  if (!existsSync(src)) continue;
  cpSync(src, join(pluginDir, entry), { recursive: true, force: true });
}
console.log("  已复制 lib / scripts / example / package.json / README.md / LICENSE");

// ---- ② 注册到 cordis.patch.yml ----
console.log(`== 注册插件： ${patchYml}`);
// 新用户/全新 DSH_HOME 可能还没有 profiles/web 目录，先创建，避免写文件失败。
mkdirSync(dirname(patchYml), { recursive: true });
let yml = "";
if (existsSync(patchYml)) yml = readFileSync(patchYml, "utf8");
if (yml.includes(pluginName)) {
  console.log("  已在 cordis.patch.yml 注册，跳过");
} else {
  writeFileSync(patchYml, yml.replace(/\s*$/, "") + patchYmlBlock, "utf8");
  console.log("  已追加 insert 条目到 cordis.patch.yml");
}

// ---- ③ 应用 harness 补丁 ----
if (skipPatch) {
  console.log("== 已跳过补丁（--skip-patch）");
} else {
  const patchScript = join(HERE, "patch-harness.mjs");
  console.log("== 应用 harness 补丁");
  const args = [patchScript];
  if (explicitTarget) args.push("--target", explicitTarget);
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("\n✗ 补丁未全部应用成功，请按上方提示处理（版本差异等）。");
    process.exitCode = 1;
  }
}

// ---- ④ 完成提示 ----
console.log("\n安装完成。请重启 dsh：\n  dsh web\n然后打开 http://127.0.0.1:3080");
if (process.platform === "win32") {
  console.log("（当前终端直接 Ctrl+C 停掉正在运行的 dsh web 再重新启动）");
}
