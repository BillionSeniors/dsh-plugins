#!/usr/bin/env node
/**
 * patch-harness.mjs
 *
 * dsh-project-file-explorer 需要改动 DeepSeek Harness 自带的两个客户端组件，
 * 才能获得完整效果。本脚本把这两处改动以幂等方式应用到本机安装的
 * `@deepseek-ai/dsh` 上（已打过的补丁自动跳过，可重复运行）：
 *
 *   1) dsh-client-ui-workspace —— 侧边栏「未分组」支持删除（归档桶内孤儿会话）
 *   2) dsh-client-ui-layout    —— 详情列始终跟随当前会话（空白会话也停靠）、
 *                                 会话切换不自动收起、窄屏降级为右侧抽屉（响应式）
 *
 * 用法：
 *   node scripts/patch-harness.mjs            # 应用补丁
 *   node scripts/patch-harness.mjs --check    # 只检查，不写入
 *   node scripts/patch-harness.mjs --target <dir>  # 指定 @deepseek-ai 依赖目录
 *
 * 注意：补丁直接修改 node_modules 内的打包产物；升级/重装 @deepseek-ai/dsh 后
 * 需要重新运行本脚本。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const CHECK = process.argv.includes("--check");
const targetFlag = process.argv.indexOf("--target");
const explicitTarget = targetFlag !== -1 ? process.argv[targetFlag + 1] : null;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把去缩进的多行 find 片段转成正则：每行行首允许任意空白。 */
function findRegex(fragment) {
  const parts = fragment.split("\n").map((line) => {
    const trimmed = line.replace(/^[ \t]+/, "");
    return "[ \\t]*" + escapeRegExp(trimmed);
  });
  return new RegExp(parts.join("\n"), "m");
}

/** 找到命中块的缩进，并按该缩进重排替换内容。 */
function buildReplacement(matchText, replaceText) {
  const indent = /^[ \t]*/.exec(matchText)?.[0] ?? "";
  return replaceText
    .split("\n")
    .map((line) => (line === "" ? "" : indent + line))
    .join("\n");
}

/**
 * 应用单个补丁。marker 用于幂等：目标文本已含 marker 则跳过。
 */
function applyPatch(filePath, { marker, find, replace }) {
  const src = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  if (src.includes(marker)) return { status: "skipped", detail: "已打过该补丁" };
  const rx = findRegex(find);
  const m = rx.exec(src);
  if (!m) return { status: "failed", detail: "未找到目标代码段（dsh 版本可能不同），请检查后手动处理" };
  const next = src.slice(0, m.index) + buildReplacement(m[0], replace) + src.slice(m.index + m[0].length);
  if (!CHECK) writeFileSync(filePath, next, "utf8");
  return { status: "applied", detail: "" };
}

/** dsh 数据根目录：优先 $DSH_HOME，否则默认 ~/.dsh */
function dshHome() {
  const env = process.env.DSH_HOME?.trim();
  return env ? resolve(env) : join(homedir(), ".dsh");
}

/** 定位 @deepseek-ai 依赖目录（包含目标两个包）。全部基于环境/默认路径，
 *  不写死盘符 —— 插件拷贝到 C:/D:/E: 等任意盘符的 dsh 安装上都能找到目标。 */
function candidateDirs() {
  const dirs = [];
  // Windows 下 Node 无法直接 spawn .cmd，经 cmd.exe /c 执行（避免 shell:true 的弃用警告）。
  const g = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm root -g"], { encoding: "utf8" })
    : spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
  if (g.status === 0) {
    const root = g.stdout.trim();
    dirs.push(join(root, "@deepseek-ai"));
    dirs.push(join(root, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
  }
  // dsh 数据目录（$DSH_HOME，未设置则 ~/.dsh）下的常见布局：
  //   1) profiles/node_modules/@deepseek-ai        —— install.mjs / README 的标准布局
  //   2) profiles/web/node_modules/@deepseek-ai     —— 兼容旧版布局
  const home = dshHome();
  dirs.push(join(home, "profiles", "node_modules", "@deepseek-ai"));
  dirs.push(join(home, "profiles", "web", "node_modules", "@deepseek-ai"));
  if (explicitTarget) dirs.push(explicitTarget);
  return dirs;
}

function locate() {
  const targets = [
    { pkg: "dsh-client-ui-workspace", rel: "lib/client.js" },
    { pkg: "dsh-client-ui-layout", rel: "lib/client.js" },
    { pkg: "dsh-client-ui-deliverables", rel: "lib/client.js" }
  ];
  for (const dir of candidateDirs()) {
    if (!existsSync(dir)) continue;
    const found = {};
    for (const t of targets) {
      const f = resolve(dir, t.pkg, t.rel);
      if (existsSync(f)) found[t.pkg] = f;
    }
    if (found["dsh-client-ui-workspace"] && found["dsh-client-ui-layout"] && found["dsh-client-ui-deliverables"]) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 补丁定义（find 均为未改动的原始代码片段；缩进在匹配时自动忽略）
// ---------------------------------------------------------------------------

const WORKSPACE_PATCHES = [
  {
    marker: "dsh-project-file-explorer: ws-menu",
    find: `const workspaceMenuItems = [{
\tid: "rename",
\tlabel: t("rename"),
\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
}, {
\tid: "delete",
\tlabel: t("delete.workspace"),
\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
\tdanger: true
}];`,
    replace: `/* dsh-project-file-explorer: ws-menu —— 未分组只显示「删除」项 */
const workspaceMenuItems = [
\t...(row.workspaceId === void 0 ? [] : [{
\t\tid: "rename",
\t\tlabel: t("rename"),
\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
\t}]),
\t{
\t\tid: "delete",
\t\tlabel: t("delete.workspace"),
\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
\t\tdanger: true
\t}
];`
  },
  {
    marker: "dsh-project-file-explorer: ws-actions",
    find: `actions: group.workspaceId === void 0 ? void 0 : {
\trename: () => {
\t\t/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
\t\tif (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
\t},
\tdelete: () => {
\t\t/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
\t\tif (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
\t}
}`,
    replace: `/* dsh-project-file-explorer: ws-actions —— 未分组也提供删除动作（归档桶内会话） */
actions: {
\trename: () => {
\t\t/* 未分组不可重命名（菜单里也不显示重命名项）。 */
\t\tif (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
\t},
\tdelete: () => {
\t\tif (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
\t\telse onDeleteRequest(void 0, group.sessions.map((node) => node.id));
\t}
}`
  },
  {
    marker: "dsh-project-file-explorer: ws-delete-target",
    find: `onDeleteRequest: (workspaceId, title) => {
\tsetDeleteTarget({
\t\tworkspaceId,
\t\ttitle
\t});
\tsetDeleteError(null);
}`,
    replace: `onDeleteRequest: (workspaceId, titleOrSessionIds) => {
\t/* dsh-project-file-explorer: ws-delete-target */
\tconst ungrouped = Array.isArray(titleOrSessionIds);
\tsetDeleteTarget({
\t\tworkspaceId,
\t\ttitle: ungrouped ? t("group.ungrouped") : titleOrSessionIds,
\t\tsessionIds: ungrouped ? titleOrSessionIds : null
\t});
\tsetDeleteError(null);
}`
  },
  {
    marker: "dsh-project-file-explorer: ws-confirm-delete",
    find: `const confirmDelete = () => {
\t/* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
\tif (deleting || deleteTarget === null) return;
\tsetDeleting(true);
\tsetDeleteCommittedId(null);
\tsetDeleteError(null);
\tdeleteWorkspace(deleteTarget.workspaceId).then(() => {
\t\tsetDeleteCommittedId(deleteTarget.workspaceId);
\t}).catch((reason) => {
\t\tsetDeleting(false);
\t\tsetDeleteError(reason instanceof Error ? reason.message : String(reason));
\t});
};`,
    replace: `const confirmDelete = () => {
\t/* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
\tif (deleting || deleteTarget === null) return;
\tsetDeleting(true);
\tsetDeleteCommittedId(null);
\tsetDeleteError(null);
\tif (deleteTarget.sessionIds !== null) {
\t\t/* dsh-project-file-explorer: ws-confirm-delete —— 未分组 → 归档桶内全部孤儿会话，桶随即消失。 */
\t\tPromise.all(deleteTarget.sessionIds.map((id) => archiveSession(id).catch(() => {})))
\t\t\t.then(() => {
\t\t\t\tsetDeleting(false);
\t\t\t\tsetDeleteTarget(null);
\t\t\t})
\t\t\t.catch((reason) => {
\t\t\t\tsetDeleting(false);
\t\t\t\tsetDeleteError(reason instanceof Error ? reason.message : String(reason));
\t\t\t});
\t\treturn;
\t}
\tdeleteWorkspace(deleteTarget.workspaceId).then(() => {
\t\tsetDeleteCommittedId(deleteTarget.workspaceId);
\t}).catch((reason) => {
\t\tsetDeleting(false);
\t\tsetDeleteError(reason instanceof Error ? reason.message : String(reason));
\t});
};`
  },
  {
    marker: "dsh-project-file-explorer: ws-delete-desc",
    find: `...deleteTarget === null ? {} : { description: t("delete.desc", { name: deleteTarget.title }) },`,
    replace: `/* dsh-project-file-explorer: ws-delete-desc —— 未分组删除弹窗的专属描述 */
...deleteTarget === null ? {} : { description: deleteTarget.sessionIds !== null ? \`将归档「未分组」中的 \${deleteTarget.sessionIds.length} 个会话，随后「未分组」消失\` : t("delete.desc", { name: deleteTarget.title }) },`
  }
];

const LAYOUT_PATCHES = [
  {
    marker: "dsh-project-file-explorer: layout-detailssession",
    find: `const detailsSession = useSessions((s) => {
\tconst current = s.current;
\treturn current !== void 0 && s.byId[current]?.blank === false ? current : void 0;
});`,
    replace: `/* dsh-project-file-explorer: layout-detailssession —— 详情列始终跟随当前会话（含空白/新建会话） */
const detailsSession = useSessions((s) => s.current);`
  },
  {
    marker: "dsh-project-file-explorer: layout-noclose",
    find: `const lastSession = (0, react.useRef)(detailsSession);
(0, react.useLayoutEffect)(() => {
\tif (detailsSession === void 0) return;
\tif (lastSession.current !== void 0 && lastSession.current !== detailsSession) actions.closeDetails();
\tlastSession.current = detailsSession;
}, [actions, detailsSession]);`,
    replace: `/* dsh-project-file-explorer: layout-noclose —— 会话切换不再自动收起右侧面板 */`
  },
  {
    marker: "dsh-project-file-explorer: layout-css",
    find: `.pI_x6G_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.pI_x6G_overlayLayer>*{pointer-events:auto}";`,
    replace: `.pI_x6G_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.pI_x6G_overlayLayer>*{pointer-events:auto}.pI_x6G_mobileDetails{position:fixed;top:0;right:0;bottom:0;width:min(360px,92vw);z-index:30;background:var(--dsw-alias-bg-layer-2,#171a21);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-16px 0 48px rgba(0,0,0,.45);display:flex;flex-direction:column;min-width:0}.pI_x6G_mobileBackdrop{position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.45)}/* dsh-project-file-explorer: layout-css */";`
  },
  {
    marker: "dsh-project-file-explorer: layout-classmap",
    find: `"centerCol": "pI_x6G_centerCol"
};`,
    replace: `/* dsh-project-file-explorer: layout-classmap */
"centerCol": "pI_x6G_centerCol",
"mobileDetails": "pI_x6G_mobileDetails",
"mobileBackdrop": "pI_x6G_mobileBackdrop"
};`
  },
  {
    marker: "dsh-project-file-explorer: layout-mobiledrawer",
    find: `const cols = computeColumns(viewport, sidebarCollapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, detailsSession === void 0 ? 0 : panels.details);`,
    replace: `const cols = computeColumns(viewport, sidebarCollapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, detailsSession === void 0 ? 0 : panels.details);
/* dsh-project-file-explorer: layout-mobiledrawer —— 窄屏详情列降级为右侧抽屉浮层 */
const mobileDrawer = cols.details === 0 && panels.details > 0;`
  },
  {
    // 修复：无会话（首页/删除全部工作区后）时 details 槽（scope: session）渲染为空，
    // 此时 mobileDrawer 为 true 会画出空白固定面板 + 全屏遮罩（z-29/30），盖住
    // 首页的项目文件浮层（shell.overlay z-20）。抽屉降级只在有会话时才有意义。
    marker: "dsh-project-file-explorer: layout-mobiledrawer-nosession",
    find: `const mobileDrawer = cols.details === 0 && panels.details > 0;`,
    replace: `/* dsh-project-file-explorer: layout-mobiledrawer-nosession —— 仅在有会话时渲染；无会话时 details 槽（scope: session）渲染为空，空白面板 + 全屏遮罩会盖住首页的项目文件浮层 */
const mobileDrawer = detailsSession !== void 0 && cols.details === 0 && panels.details > 0;`
  },
  {
    marker: "dsh-project-file-explorer: layout-col-conditional",
    find: `(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(CenterColumn, { children: renderSlot("conversation", {}) }), (0, react_jsx_runtime.jsx)(DetailsColumn, { children: renderSlot("details", {}) })] }),`,
    replace: `/* dsh-project-file-explorer: layout-col-conditional —— 窄屏时详情列不占网格 */
(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(CenterColumn, { children: renderSlot("conversation", {}) }), !mobileDrawer && (0, react_jsx_runtime.jsx)(DetailsColumn, { children: renderSlot("details", {}) })] }),`
  },
  {
    marker: "dsh-project-file-explorer: layout-drawer-render",
    find: `cols.details > 0 && (0, react_jsx_runtime.jsx)(DragHandle, {
\tside: "details",
\tleft: viewport - cols.details,
\tonStart: onDetailsStart,
\tonDrag: onDetailsDrag,
\tonEnd: onDragEnd
})
\t]
});`,
    replace: `/* dsh-project-file-explorer: layout-drawer-render —— 窄屏详情列渲染为右侧抽屉 */
cols.details > 0 && (0, react_jsx_runtime.jsx)(DragHandle, {
\tside: "details",
\tleft: viewport - cols.details,
\tonStart: onDetailsStart,
\tonDrag: onDetailsDrag,
\tonEnd: onDragEnd
}),
mobileDrawer && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
\t(0, react_jsx_runtime.jsx)("div", {
\t\tclassName: AppFrame_module_css_default.mobileBackdrop,
\t\tonClick: () => actions.closeDetails()
\t}),
\t(0, react_jsx_runtime.jsx)("div", {
\t\tclassName: AppFrame_module_css_default.mobileDetails,
\t\tchildren: renderSlot("details", {})
\t})
] })
\t]
});`
  }
];

// ---------------------------------------------------------------------------
// 3) dsh-client-ui-deliverables —— 内置「产物」文件链接改为主区标签打开
//    （dsh-project-file-explorer 提供 window.__projectFileExplorerOpen 时走它，
//    否则退回系统默认应用打开；「在文件夹中显示」保持系统打开）
// ---------------------------------------------------------------------------

const DELIVERABLES_PATCHES = [
  {
    marker: "dsh-project-file-explorer: deliverables-open-mention",
    find: `open: () => {
\topenFile(path);
},`,
    replace: `open: () => {
\t/* dsh-project-file-explorer: deliverables-open-mention —— 文件链接改为主区标签打开（带改动标注） */
\t(typeof window !== "undefined" && typeof window.__projectFileExplorerOpen === "function")
\t\t? window.__projectFileExplorerOpen(path)
\t\t: openFile(path);
},`
  },
  {
    marker: "dsh-project-file-explorer: deliverables-open-row",
    find: `onClick: () => {
\topenFile(path);
},`,
    replace: `onClick: () => {
\t/* dsh-project-file-explorer: deliverables-open-row —— 产物行文件链接改为主区标签打开 */
\t(typeof window !== "undefined" && typeof window.__projectFileExplorerOpen === "function")
\t\t? window.__projectFileExplorerOpen(path)
\t\t: openFile(path);
},`
  }
];

// ---------------------------------------------------------------------------

function run() {
  const targets = locate();
  if (!targets) {
    console.error("✗ 未找到 @deepseek-ai/dsh 的依赖目录（dsh-client-ui-workspace / dsh-client-ui-layout / dsh-client-ui-deliverables）。");
    console.error("  请先安装 DeepSeek Harness： npm install -g @deepseek-ai/dsh");
    console.error("  或用 --target <@deepseek-ai依赖目录> 指定位置。");
    process.exit(1);
  }
  console.log(CHECK ? "[检查模式 --check] 不写入任何文件\n" : "");
  console.log(`目标依赖目录： ${dirname(targets["dsh-client-ui-workspace"])}\n`);
  let fail = 0;
  for (const [label, file, patches] of [
    ["dsh-client-ui-workspace（未分组删除）", targets["dsh-client-ui-workspace"], WORKSPACE_PATCHES],
    ["dsh-client-ui-layout（响应式详情列）", targets["dsh-client-ui-layout"], LAYOUT_PATCHES],
    ["dsh-client-ui-deliverables（产物链接主区打开）", targets["dsh-client-ui-deliverables"], DELIVERABLES_PATCHES]
  ]) {
    console.log(`== ${label} ==`);
    console.log(`  文件： ${file}`);
    for (const p of patches) {
      const r = applyPatch(file, p);
      const tag = r.status === "applied" ? "✓ 已应用" : r.status === "skipped" ? "· 已存在" : "✗ 失败";
      console.log(`  ${tag}  ${p.marker.split(": ")[1]}`);
      if (r.status === "applied") console.log(`        ${r.detail}`);
      if (r.status === "failed") {
        console.log(`        ${r.detail}`);
        fail += 1;
      }
    }
    console.log("");
  }
  if (CHECK) {
    console.log("检查完成。使用 `node scripts/patch-harness.mjs` 应用补丁。");
  } else if (fail === 0) {
    console.log("补丁应用完成。请重启 `dsh web`（重新打开 http://127.0.0.1:3080）使改动生效。");
  } else {
    console.log(`有 ${fail} 处补丁未能应用，请对照 dsh 版本确认后手动处理。`);
    process.exitCode = 1;
  }
}

run();
