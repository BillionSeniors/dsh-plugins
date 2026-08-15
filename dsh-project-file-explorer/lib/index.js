import { readdir, stat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve, dirname, relative, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Host half of the project file explorer plugin: registers two HTTP routes on
// the dsh web server that expose host filesystem listing and file preview
// (the client cannot read files through the RPC surface, which only offers
// directory browsing under the `browse` capability). Routes:
//   GET /project-files/list?path=<abs dir>             -> { ok, path, dirs[], files[] }
//       每个条目带 changed 标记（git 仓库内未提交改动；非 git 环境无此标记）
//   GET /project-files/read?path=<abs file>[&session=<id>] -> { ok, path, size, kind, ..., diff }
//     kind=image|audio|video|pdf -> media dataUrl for in-browser rendering
//     kind=text                  -> utf8 content (first 96KB) + diff 行级标注
//     kind=binary                -> not a text file, no preview content
//     kind=oversize              -> media file larger than the preview cap
//   diff: Trae 风格的颜色标注数据 —— 哪行是新增（added）、哪行是删除（removed）、
//   哪行是原文（context）。来源优先级：
//     1) 会话日志（session 参数）：把本会话 AI 对该文件的编辑逆向还原出改动前
//        的旧内容，再与当前内容逐行对比 —— 不需要 git，第一次打开也能看到标注
//     2) git diff（文件在 git 仓库内且有未提交改动）
//     3) 快照对比：插件缓存该文件上次打开时的内容（兜底）
//   返回 [{type:context|added|removed,text,oldLine,newLine}]。
const name = "project-file-explorer";
const inject = ["webServer"];
const LIST_PATH = "/project-files/list";
const READ_PATH = "/project-files/read";
const TEXT_PREVIEW_LIMIT = 96 * 1024;
const MEDIA_PREVIEW_LIMIT = 10 * 1024 * 1024;

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif", ".svg"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".opus"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"]);
const MEDIA_MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac", aac: "audio/aac", opus: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", m4v: "video/mp4"
};

function fileKind(abs) {
  const ext = extname(abs).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (ext === ".pdf") return "pdf";
  return "text";
}

function mimeFor(abs) {
  return MEDIA_MIME[extname(abs).slice(1).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 行级 diff（LCS 动态规划），对比旧/新两份文本的每一行。
 * @returns { changed:boolean, lines:[{type,text,oldLine,newLine}] | null }
 *          lines 为 null 表示内容过大放弃对比（回退普通预览）。
 */
function diffLines(oldText, newText) {
  const a = String(oldText ?? "").split("\n");
  const b = String(newText ?? "").split("\n");
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return { changed: false, lines: null }; // 内容过大，放弃对比
  if (n === 0 && m === 0) return { changed: false, lines: [] };
  if (n === 0) {
    return {
      changed: true,
      lines: b.map((text, i) => ({ type: "added", text, oldLine: null, newLine: i + 1 }))
    };
  }
  if (m === 0) {
    return {
      changed: true,
      lines: a.map((text, i) => ({ type: "removed", text, oldLine: i + 1, newLine: null }))
    };
  }
  // LCS DP 矩阵（展平为 Uint32Array，行优先）
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = 1; i <= n; i++) {
    const row = i * W;
    const prev = (i - 1) * W;
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      dp[row + j] = ai === b[j - 1]
        ? dp[prev + j - 1] + 1
        : Math.max(dp[prev + j], dp[row + j - 1]);
    }
  }
  // 回溯生成 diff
  const out = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ type: "context", text: a[i - 1], oldLine: i, newLine: j });
      i--; j--;
    } else if (dp[(i - 1) * W + j] >= dp[i * W + j - 1]) {
      out.push({ type: "removed", text: a[i - 1], oldLine: i, newLine: null });
      i--;
    } else {
      out.push({ type: "added", text: b[j - 1], oldLine: null, newLine: j });
      j--;
    }
  }
  while (i > 0) { out.push({ type: "removed", text: a[i - 1], oldLine: i, newLine: null }); i--; }
  while (j > 0) { out.push({ type: "added", text: b[j - 1], oldLine: null, newLine: j }); j--; }
  out.reverse();
  const changed = out.some((l) => l.type !== "context");
  return { changed, lines: changed ? out : null };
}

// ---------------------------------------------------------------------------
// git 辅助（全部失败返回 null，绝不抛到路由；没有 git 时自动退回其他 diff 来源）
// ---------------------------------------------------------------------------
async function gitRoot(cwd) {
  try {
    const { stdout } = await execFileP("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
    return stdout.trim() || null;
  } catch { return null; }
}

/** 目录内所有「未提交改动」的绝对路径集合（git status --porcelain）。 */
async function gitStatusChangedSet(root, dirAbs) {
  try {
    const rel = relative(root, dirAbs) || ".";
    const { stdout } = await execFileP("git", ["status", "--porcelain", "-z", "--", rel], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const set = new Set();
    for (const part of stdout.split("\0")) {
      if (part.length < 4) continue;
      const st = part.slice(0, 2);
      if (st.trim() === "" && !st.includes("?")) continue;
      let pth = part.slice(3);
      if (pth.startsWith('"')) { try { pth = JSON.parse(pth); } catch { /* 保持原样 */ } }
      if (pth) set.add(resolve(root, pth));
    }
    return set;
  } catch { return null; }
}

/** 解析 git unified diff → 行级 [{type,text,oldLine,newLine}]。 */
function parseGitDiff(stdout) {
  const out = [];
  let oldLine = 0, newLine = 0;
  for (const raw of stdout.split("\n")) {
    if (raw.startsWith("@@")) {
      const mo = /-(\d+)/.exec(raw);
      const mn = /\+(\d+)/.exec(raw);
      oldLine = mo ? parseInt(mo[1], 10) : 0;
      newLine = mn ? parseInt(mn[1], 10) : 0;
      continue;
    }
    if (raw === "" || raw.startsWith("\\") || raw.startsWith("---") || raw.startsWith("+++")
      || raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("new file")
      || raw.startsWith("deleted file") || raw.startsWith("similarity") || raw.startsWith("rename")) continue;
    const c = raw[0];
    if (c === "+") out.push({ type: "added", text: raw.slice(1), oldLine: null, newLine: newLine++ });
    else if (c === "-") out.push({ type: "removed", text: raw.slice(1), oldLine: oldLine++, newLine: null });
    else if (c === " ") out.push({ type: "context", text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
  }
  const changed = out.some((l) => l.type !== "context");
  return { changed, lines: changed ? out : null };
}

/**
 * 单文件的 git diff（已跟踪文件）或未跟踪标记。
 * @returns {changed,lines}|{untracked:true}|null
 */
async function gitDiffFor(abs) {
  const root = await gitRoot(dirname(abs));
  if (!root) return null;
  const rel = relative(root, abs);
  let tracked = true;
  try { await execFileP("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: root, encoding: "utf8" }); }
  catch { tracked = false; }
  if (!tracked) return { untracked: true };
  try {
    const { stdout } = await execFileP("git", ["diff", "HEAD", "--", rel], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (stdout.trim() === "") return { changed: false, lines: null };
    return { changed: true, lines: parseGitDiff(stdout).lines ?? [] };
  } catch {
    try {
      const { stdout } = await execFileP("git", ["diff", "--", rel], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      if (stdout.trim() === "") return { changed: false, lines: null };
      return { changed: true, lines: parseGitDiff(stdout).lines ?? [] };
    } catch { return null; }
  }
}

// ---------------------------------------------------------------------------
// 会话基线：把本会话 AI 对该文件的编辑逆向还原出改动前的旧内容
// ---------------------------------------------------------------------------
const EDIT_TOOL_NAMES = new Set(["edit", "str_replace_editor", "write", "write_file", "create_file", "apply_patch", "replace"]);

// ---------------------------------------------------------------------------
// 会话编辑操作索引：
// 优先从「活动会话」的内存事件快照构建（毫秒级、永远新鲜、不读盘）；
// 会话不在内存（非活动/历史）时才回退持久层全量读取（慢路径）。
// ---------------------------------------------------------------------------
const sessionScanCache = new Map(); // sessionId -> { seq, calls:[], failed:Set }
const inflightScans = new Map(); // sessionId -> Promise
const SCAN_CACHE_LIMIT = 24;

// 文件级 diff 缓存：按「文件修改时间+大小」校验，重开标签秒回且颜色保留。
// 只缓存会话基线算出的 diff（快照/git 结果不缓存，保持原有语义）。
const fileDiffCache = new Map(); // absPath -> { stamp, diff }
const FILE_DIFF_CACHE_LIMIT = 512;

/** 把一批事件灌入条目：只处理 seq 大于当前进度的新事件（幂等、去重）。 */
function ingestSessionEvents(entry, events) {
  let maxSeq = entry.seq;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const seq = typeof ev.seq === "number" ? ev.seq : 0;
    if (seq <= entry.seq) continue; // 已吸收过，跳过（避免重复入列）
    if (seq > maxSeq) maxSeq = seq;
    const d = ev.data;
    if (ev.type === "tool/result" && d && d.callId && d.error) entry.failed.add(String(d.callId));
    if (ev.type === "tool/call" && d && typeof d.arguments === "string" && EDIT_TOOL_NAMES.has(d.name)) {
      try {
        entry.calls.push({
          name: String(d.name),
          callId: String(d.callId),
          turn: typeof d.turn === "number" ? d.turn : 0,
          args: JSON.parse(d.arguments)
        });
      } catch { /* 参数解析失败忽略 */ }
    }
  }
  entry.seq = maxSeq;
}

/**
 * 构建（或复用）某会话的编辑操作索引：
 * - 活动会话：直接用内存事件快照全量重建（毫秒级，天然最新，无需缓存节流）
 * - 非活动会话：回退持久层读取，并缓存结果
 */
async function ensureSessionScan(sessions, query, persistence, sessionId) {
  const live = sessions ? sessions.get(sessionId) : undefined;
  if (live && Array.isArray(live.events)) {
    const entry = { seq: 0, calls: [], failed: new Set() };
    if (live.events.length > 0) ingestSessionEvents(entry, live.events);
    if (typeof live.seq === "number" && live.seq > entry.seq) entry.seq = live.seq;
    return entry;
  }
  // 非活动会话：持久层慢路径（带缓存 + 并发去重）
  let entry = sessionScanCache.get(sessionId);
  let p = inflightScans.get(sessionId);
  if (p) return p;
  p = (async () => {
    if (!entry) {
      entry = { seq: 0, calls: [], failed: new Set() };
      sessionScanCache.set(sessionId, entry);
      if (sessionScanCache.size > SCAN_CACHE_LIMIT) {
        sessionScanCache.delete(sessionScanCache.keys().next().value);
      }
    }
    try {
      let events = [];
      if (persistence) {
        const res = await persistence.readFrom(sessionId, entry.seq === 0 ? 0 : entry.seq + 1);
        events = res && Array.isArray(res.events) ? res.events : [];
      }
      if (events.length === 0 && query) {
        const res = await query.readSession(sessionId);
        events = res && Array.isArray(res.events) ? res.events : [];
      }
      if (events.length > 0) ingestSessionEvents(entry, events);
    } catch { /* 读取失败保持现有索引 */ }
    return entry;
  })().finally(() => inflightScans.delete(sessionId));
  inflightScans.set(sessionId, p);
  return p;
}

/** 后台预热（不阻塞路由响应）。 */
function warmSessionScan(sessions, query, persistence, sessionId) {
  if (!sessionId) return;
  ensureSessionScan(sessions, query, persistence, sessionId).catch(() => { /* 预热失败忽略 */ });
}

/**
 * 从会话索引取该文件被 AI 修改过的操作序列（排除失败调用）。
 * @returns ops:[{name,args}] 按时间正序；无则 null。
 */
async function sessionEditOpsFor(sessions, query, persistence, sessionId, absPath) {
  if (!sessionId) return null;
  try {
    const entry = await ensureSessionScan(sessions, query, persistence, sessionId);
    if (!entry || entry.calls.length === 0) return null;
    const norm = (p) => resolve(String(p)).toLowerCase();
    const target = norm(absPath);
    const ops = entry.calls.filter((c) => {
      if (entry.failed.has(c.callId) || !c.args) return false;
      const p = c.args.path || c.args.file_path; // edit/write 工具用 file_path
      return typeof p === "string" && norm(p) === target;
    });
    return ops.length === 0 ? null : ops;
  } catch { return null; }
}

/**
 * 逆向应用编辑：从当前内容推出改动前的旧内容（宽容模式）。
 * - write/create 可作为基线边界：最后一次 write 的内容即基准，更早的操作已覆盖
 * - 某次 edit 的新文本在当前内容中找不到 → 已被后续操作覆盖，跳过继续，不整体失败
 * 返回还原后的旧内容（尽力而为）。
 */
function reverseEdits(current, ops) {
  let content = current;
  for (let i = ops.length - 1; i >= 0; i--) {
    const { name, args } = ops[i];
    if (name === "write" || name === "write_file" || name === "create_file") {
      if (typeof args.content === "string") {
        content = args.content; // 以该次写入的内容为基线，更早的操作已被覆盖
        break;
      }
      continue;
    }
    const oldS = args.old_string;
    const newS = args.new_string;
    if (typeof oldS !== "string" || typeof newS !== "string" || oldS === newS) continue;
    if (!content.includes(newS)) continue; // 已被后续操作覆盖，跳过
    content = args.replace_all === true
      ? content.split(newS).join(oldS)
      : content.replace(newS, oldS);
  }
  return content;
}

/** 文件内容快照缓存：path -> 上次打开时的 utf8 内容（兜底 diff 来源）。 */
const fileSnapshots = new Map();
const SNAPSHOT_LIMIT = 256; // 最多缓存 256 个文件，防内存膨胀

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

/** Keep cross-origin pages from using this endpoint as a file read oracle. */
function hostAllowed(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true; // direct navigation / non-browser client
  try {
    const u = new URL(origin);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

function apply(ctx) {
  const query = ctx.get("sessionQuery");
  const persistence = ctx.get("sessionPersistence");
  const sessions = ctx.get("sessions");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/project-files",
    handler: async (req, res) => {
      if (!hostAllowed(req)) return json(res, 403, { ok: false, error: "forbidden origin" });
      try {
        const url = new URL(req.url, "http://localhost");
        const raw = url.searchParams.get("path");
        if (url.pathname === LIST_PATH) {
          if (!raw) return json(res, 400, { ok: false, error: "missing path" });
          const abs = resolve(raw);
          const st = await stat(abs).catch(() => null);
          if (!st || !st.isDirectory()) return json(res, 404, { ok: false, error: `not a directory: ${abs}` });
          // 后台预热会话编辑索引：用户浏览文件夹时就把日志扫好，点文件时无需等待
          warmSessionScan(sessions, query, persistence, url.searchParams.get("session") || undefined);
          const dirents = await readdir(abs, { withFileTypes: true });
          const dirs = [];
          const files = [];
          for (const d of dirents) {
            const full = join(abs, d.name);
            let info = null;
            try {
              info = await stat(full);
            } catch {
              continue;
            }
            const row = { name: d.name, path: full, size: info.size, mtime: info.mtimeMs, changed: false };
            if (d.isDirectory() || d.isSymbolicLink()) dirs.push(row);
            else files.push(row);
          }
          // git 未提交改动标记（非 git 环境自动跳过）
          try {
            const root = await gitRoot(abs);
            if (root) {
              const changedSet = await gitStatusChangedSet(root, abs);
              if (changedSet && changedSet.size > 0) {
                const mark = (row) => {
                  if (changedSet.has(row.path)) return true;
                  if (row.path.endsWith(sep) === false) {
                    for (const p of changedSet) {
                      if (p.startsWith(row.path + sep)) return true;
                    }
                  }
                  return false;
                };
                for (const r of dirs) r.changed = mark(r);
                for (const r of files) r.changed = changedSet.has(r.path);
              }
            }
          } catch { /* git 不可用时无标记 */ }
          const cmp = (a, b) => a.name.localeCompare(b.name, "zh");
          dirs.sort(cmp);
          files.sort(cmp);
          return json(res, 200, { ok: true, path: abs, home: homedir(), dirs, files });
        }
        if (url.pathname === READ_PATH) {
          if (!raw) return json(res, 400, { ok: false, error: "missing path" });
          const abs = resolve(raw);
          const st = await stat(abs).catch(() => null);
          if (!st || !st.isFile()) return json(res, 404, { ok: false, error: `not a file: ${abs}` });
          const kind = fileKind(abs);
          // 图片 / 音频 / 视频 / PDF：读取完整文件并以 data URL 返回，客户端直接渲染
          if (kind !== "text") {
            if (st.size > MEDIA_PREVIEW_LIMIT) {
              return json(res, 200, { ok: true, path: abs, size: st.size, kind: "oversize" });
            }
            const buf = Buffer.alloc(st.size);
            const fh = await open(abs, "r");
            try {
              await fh.read(buf, 0, st.size, 0);
            } finally {
              await fh.close();
            }
            return json(res, 200, {
              ok: true,
              path: abs,
              size: st.size,
              kind,
              dataUrl: `data:${mimeFor(abs)};base64,${buf.toString("base64")}`
            });
          }
          // 其余按文本处理：读取前 96KB；含 NUL 字节则视为二进制文件
          const readLen = Math.min(st.size, TEXT_PREVIEW_LIMIT);
          const buf = Buffer.alloc(readLen);
          const fh = await open(abs, "r");
          try {
            await fh.read(buf, 0, readLen, 0);
          } finally {
            await fh.close();
          }
          if (buf.includes(0)) {
            return json(res, 200, { ok: true, path: abs, size: st.size, kind: "binary", truncated: st.size > readLen });
          }
          const content = buf.toString("utf8");
          const stamp = st.mtimeMs + ":" + st.size;
          let diffResult = { changed: false, lines: null };
          // ① 会话基线（AI 本会话的改动，无需 git）
          //    文件级缓存：文件未变化且曾用会话基线算过 → 直接复用（重开秒回、颜色保留）
          if (!(st.size > readLen)) {
            const sessionParam = url.searchParams.get("session") || undefined;
            const cached = fileDiffCache.get(abs);
            if (cached && cached.stamp === stamp) {
              diffResult = cached.diff;
            } else {
              const ops = sessionParam ? await sessionEditOpsFor(sessions, query, persistence, sessionParam, abs) : null;
              if (ops && ops.length > 0) {
                // 只标注「最新一次更新」（最后一个改过该文件的回合）的改动，
                // 不累积历史标注：基线 = 把最后一个回合的操作逆向回去。
                // 逆向不动（内容对不上）时退回全量逆向。
                const lastTurn = ops[ops.length - 1].turn ?? 0;
                let baseline = reverseEdits(content, ops.filter((o) => (o.turn ?? 0) === lastTurn));
                if (baseline === content && ops.length > 1) {
                  baseline = reverseEdits(content, ops);
                }
                diffResult = diffLines(baseline, content);
                // 只留最新一次的结果，旧的按文件时间戳自动覆盖，不堆积
                fileDiffCache.set(abs, { stamp, diff: diffResult });
                if (fileDiffCache.size > FILE_DIFF_CACHE_LIMIT) {
                  fileDiffCache.delete(fileDiffCache.keys().next().value);
                }
              }
            }
          }
          // ② git diff
          if (!diffResult.changed) {
            try {
              const g = await gitDiffFor(abs);
              if (g && g.untracked && !(st.size > readLen)) {
                const lines = content.split("\n").map((text, i) => ({ type: "added", text, oldLine: null, newLine: i + 1 }));
                diffResult = { changed: true, lines };
              } else if (g && g.changed && g.lines) {
                diffResult = { changed: true, lines: g.lines };
              }
            } catch { /* git 不可用 */ }
          }
          // ③ 快照兜底
          if (!diffResult.changed && !(st.size > readLen)) {
            const prev = fileSnapshots.get(abs);
            if (prev !== undefined) diffResult = diffLines(prev, content);
          }
          fileSnapshots.set(abs, content);
          if (fileSnapshots.size > SNAPSHOT_LIMIT) {
            fileSnapshots.delete(fileSnapshots.keys().next().value);
          }
          return json(res, 200, {
            ok: true,
            path: abs,
            size: st.size,
            kind: "text",
            truncated: st.size > readLen,
            content,
            diff: diffResult
          });
        }
        return json(res, 404, { ok: false, error: "unknown route" });
      } catch (e) {
        return json(res, 500, { ok: false, error: String((e && e.message) || e) });
      }
    }
  }), "project-file-explorer: fs routes");
}

export { apply, inject, name };
