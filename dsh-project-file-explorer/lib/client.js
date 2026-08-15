window.__ModuleLoader__.load({
	id: "@local/dsh-project-file-explorer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		let prim = require("@deepseek-ai/dsh-client-ui-primitives");

		const {
			Button, Input,
			IconFolderOpen16, IconCodeOutline16,
			IconSearchOutline16, IconRefreshOutline14, IconBrowseOutline16,
			IconChevronRightOutline14, IconChevronLeftOutline14, IconFolderOpenOutline16
		} = prim;

		// ---------- panel state ----------
		// 项目文件面板：有会话时停靠在原生右侧 details 列（对话区随之收缩，带原生
		// 调宽把手）；无会话（首页）时退化为右侧浮层。收起时最右缘显示细长箭头按钮，
		// 点击一次即展开；展开后面板头部有「收起」按钮缩回。整个过程不需要进入会话。
		// 启动默认收起：避免重启后先弹浮层再切停靠的跳变/空白，界面正常呈现。
		const panelListeners = new Set();
		let panelOpen = false;
		function setPanelOpen(v) {
			if (panelOpen === v) return;
			panelOpen = v;
			for (const l of [...panelListeners]) l();
		}
		function subscribePanel(l) {
			panelListeners.add(l);
			return () => panelListeners.delete(l);
		}
		function getPanelOpen() {
			return panelOpen;
		}

		// 浮层宽度：无会话时拖左缘把手缩放（320-560px），进程内记忆。
		const widthListeners = new Set();
		let drawerWidth = 400;
		function setDrawerWidth(v) {
			const next = Math.min(560, Math.max(320, Math.round(v)));
			if (drawerWidth === next) return;
			drawerWidth = next;
			for (const l of [...widthListeners]) l();
		}
		function subscribeWidth(l) {
			widthListeners.add(l);
			return () => widthListeners.delete(l);
		}
		function getDrawerWidth() {
			return drawerWidth;
		}

		// ---------- 跳转打开：会话里点「改动文件」→ 面板定位到该文件并打开（带 diff 标注） ----------
		const jumpListeners = new Set();
		let jumpTarget = null; // { path, name, at }
		function notifyJump(t) {
			jumpTarget = t;
			for (const l of [...jumpListeners]) l();
		}
		function subscribeJump(l) {
			jumpListeners.add(l);
			return () => jumpListeners.delete(l);
		}
		function getJumpTarget() {
			return jumpTarget;
		}
		function baseNameOf(p) {
			const parts = String(p).split(/[\\/]+/);
			return parts[parts.length - 1] || String(p);
		}
		let layoutOpenFn = null; // set in apply(ctx)
		function jumpToFile(absPath) {
			setPanelOpen(true);
			if (layoutOpenFn) {
				try { layoutOpenFn(); } catch (e) { /* layout 尚未就绪 */ }
			}
			notifyJump({ path: String(absPath), name: baseNameOf(absPath), at: Date.now() });
		}

		// ---------- 记住每个工作区最后浏览的文件夹：重启/切会话后直接恢复，不空白等待 ----------
		const LAST_FOLDERS_KEY = "@local/dsh-project-file-explorer/lastFolders";
		let lastFolders = {};
		try {
			const v = window.localStorage.getItem(LAST_FOLDERS_KEY);
			if (v) lastFolders = JSON.parse(v) || {};
		} catch (e) { /* localStorage 不可用时仅内存 */ }
		function rememberFolder(workspacePath, folderPath) {
			if (!folderPath) return;
			lastFolders[workspacePath || "_"] = folderPath;
			try { window.localStorage.setItem(LAST_FOLDERS_KEY, JSON.stringify(lastFolders)); } catch (e) { /* 忽略 */ }
		}

		// ---------- file preview tabs (conversation.view entries, next to 对话/轨迹) ----------
		// 有会话时点击文件，在主会话区的「对话 / 轨迹」标签栏右侧新增一个文件标签；
		// 点击标签即在主区域打开该文件预览（代码=文本、图片=图片、媒体=播放器）。
		const tabListeners = new Set();
		const openTabs = new Map(); // tabId -> { id, path, name }
		let tabSeq = 0;
		let registerTab = null; // set in apply(ctx): (tab) => disposer
		let disposeTab = null; // set in apply(ctx): (tabId) => void
		let closeDock = null; // set in apply(ctx): () => void —— 窄屏打开文件后收起面板
		function subscribeTabs(fn) {
			tabListeners.add(fn);
			return () => tabListeners.delete(fn);
		}
		function notifyTabs() {
			for (const l of [...tabListeners]) l();
		}
		/** 打开一个文件标签；同路径已打开则重新激活（编辑器惯例，不关闭）。返回 tabId 或 null。 */
		function openFileTab(file, sessionId) {
			for (const [id, tab] of openTabs) {
				if (tab.path === file.path) {
					// 已打开：激活它（点对应标签切换视图），而不是关掉
					setTimeout(() => {
						const list = document.querySelector('[role="tablist"]');
						const tabs = list ? [...list.querySelectorAll('[role="tab"]')] : [];
						let target = null;
						for (const t of tabs) if (t.textContent === tab.name) target = t;
						if (target) target.click();
					}, 50);
					return null;
				}
			}
			const id = "pfe-tab-" + (++tabSeq);
			const tab = { id, path: file.path, name: file.name, sessionId };
			openTabs.set(id, tab);
			registerTab?.(tab);
			notifyTabs();
			// 自动激活：等标签渲染到「对话/轨迹」标签栏后，模拟点击该标签
			// （标签按钮的 onClick 即 actions.setView(id)）。只在 tablist 内查找，
			// 避免点到页面其他位置的 role="tab" 元素。
			setTimeout(() => {
				const list = document.querySelector('[role="tablist"]');
				const tabs = list ? [...list.querySelectorAll('[role="tab"]')] : [];
				const target = tabs[tabs.length - 1];
				if (target) target.click();
				// 窄屏（手机/平板）下自动收起右侧面板，让主区域的文件预览可见
				if (window.innerWidth < 768) closeDock?.();
			}, 150);
			return id;
		}
		function closeFileTab(id) {
			if (!openTabs.has(id)) return;
			openTabs.delete(id);
			disposeTab?.(id);
			notifyTabs();
		}
		function closeAllTabs() {
			for (const id of [...openTabs.keys()]) closeFileTab(id);
		}

		// ---------- drag & drop: drag a file row into the chat input (IDE style) ----------
		// 从项目文件面板把文件拖到「给智能体发消息」输入框，松手即在光标处生成路径引用，
		// 可连续拖多个文件（路径以空格分隔追加）。输入框是 React 受控 <textarea>
		// （外层 [data-input-scroll]），必须走原生 value setter + input 事件才能被
		// React onChange 捕获，直接改 .value 会被 React 状态覆盖。
		function isChatInput(target) {
			return target instanceof Element && target.closest("[data-input-scroll]") !== null;
		}
		function insertPathToInput(path) {
			const el = document.querySelector("[data-input-scroll] textarea");
			if (!el || el.disabled || el.readOnly) return false;
			try {
				const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
				const cur = el.value;
				const sep = cur && !/\s$/.test(cur) ? " " : "";
				const next = cur + sep + path;
				setter.call(el, next);
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.focus();
				setTimeout(() => el.setSelectionRange(next.length, next.length), 0);
				return true;
			} catch (e) { return false; }
		}
		function notifyDropToast(text) {
			let el = document.querySelector(".pfe-drop-toast");
			if (!el) {
				el = document.createElement("div");
				el.className = "pfe-drop-toast";
				document.body.appendChild(el);
			}
			el.textContent = text;
			el.style.opacity = "1";
			clearTimeout(el._hideTimer);
			el._hideTimer = setTimeout(() => { el.style.opacity = "0"; }, 2200);
		}

		// ---------- pointer-based custom drag (no native HTML5 DnD) ----------
		// 用 mousedown + mousemove + mouseup 模拟拖拽，避免原生 DnD 会话异常时
		// 光标卡死（拖拽源被 React 重渲染替换 / dataTransfer 异常都会导致拖不住、
		// 松不开）。拖拽中显示跟随鼠标的「幽灵」提示，经过对话输入框时给输入框
		// 加虚线高亮，松开落在输入框内即插入路径引用。
		let pfeDrag = null; // { path, ghost, dx, dy }
		function pfeMoveGhost(x, y) {
			if (!pfeDrag) return;
			pfeDrag.ghost.style.left = (x - pfeDrag.dx) + "px";
			pfeDrag.ghost.style.top = (y - pfeDrag.dy) + "px";
			pfeSetInputHighlight(isChatInput(document.elementFromPoint(x, y)));
		}
		function pfeSetInputHighlight(on) {
			const ta = document.querySelector("[data-input-scroll] textarea");
			if (ta) ta.classList.toggle("pfe-drop-target", on);
		}
		function pfeStartDrag(path, name, x, y) {
			pfeStopDrag();
			const ghost = document.createElement("div");
			ghost.className = "pfe-ghost";
			ghost.textContent = name + " — 拖到对话输入框松开，插入文件路径";
			document.body.appendChild(ghost);
			const r = ghost.getBoundingClientRect();
			pfeDrag = { path, ghost, dx: x - r.left, dy: y - r.top };
			pfeMoveGhost(x, y);
		}
		function pfeStopDrag() {
			if (pfeDrag) {
				pfeDrag.ghost.remove();
				pfeDrag = null;
			}
			pfeSetInputHighlight(false);
		}
		/** 在行上按下鼠标后，超过阈值移动即进入拖拽；松开落在输入框内则插入路径。 */
		function pfeRowMouseHandlers(item) {
			let moved = false;
			let sx = 0, sy = 0;
			const onMouseDown = (e) => {
				if (e.button !== 0) return;
				sx = e.clientX; sy = e.clientY;
				moved = false;
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			};
			const onMove = (e) => {
				if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 5) {
					moved = true;
					document.body.style.userSelect = "none";
					pfeStartDrag(item.path, item.name, e.clientX, e.clientY);
				}
				if (moved) pfeMoveGhost(e.clientX, e.clientY);
			};
			const onUp = (e) => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				if (!moved) return; // 没拖动 = 普通点击，走 onClick 打开预览
				e.preventDefault(); // 阻止拖拽松手后触发 click
				if (isChatInput(document.elementFromPoint(e.clientX, e.clientY))) {
					if (insertPathToInput(item.path)) notifyDropToast("已插入文件路径：" + item.path);
					else notifyDropToast("无法插入：对话输入框当前不可编辑");
				}
				pfeStopDrag();
			};
			return onMouseDown;
		}

		// ---------- styles (theme tokens from dsh-client-ui-theme) ----------
		const styleTagId = "@local/dsh-project-file-explorer/styles";
		const css = [
			/* right-edge expand tab: slim pill pinned to the far right (always visible) */
			".pfe-tab-wrap{position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:80;pointer-events:auto}",
			".pfe-tab{display:flex;flex-direction:column;align-items:center;gap:9px;width:46px;padding:16px 0 14px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-right:none;border-radius:12px 0 0 12px;background:var(--dsw-alias-bg-layer-1,#1b1f27);color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;box-shadow:-8px 0 24px rgba(0,0,0,.28);transition:background .16s ease,color .16s ease,border-color .16s ease;user-select:none}",
			".pfe-tab:hover{background:var(--dsw-alias-bg-layer-2,#21252f);color:var(--dsw-alias-label-primary,#e6e9ef)}",
			".pfe-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-2px}",
			".pfe-tab-icon{display:inline-flex;color:var(--dsw-alias-brand-primary,#5b9dff)}",
			".pfe-tab-label{writing-mode:vertical-rl;font-size:12px;font-weight:600;letter-spacing:.14em;text-orientation:mixed;line-height:1.2}",
			".pfe-tab-arrow{display:inline-flex;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
			/* floating fallback drawer (no session / home page only) */
			".pfe-drawer{position:fixed;top:0;right:0;bottom:0;width:400px;max-width:96vw;z-index:80;display:flex;min-width:0;background:var(--dsw-alias-bg-layer-1,#1b1f27);border-left:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));box-shadow:-16px 0 48px rgba(0,0,0,.38);animation:pfe-drawer-in .22s cubic-bezier(.2,.8,.3,1);pointer-events:auto;outline:none}",
			"@keyframes pfe-drawer-in{from{transform:translateX(28px);opacity:.5}to{transform:translateX(0);opacity:1}}",
			".pfe-resizer{position:absolute;left:-7px;top:0;bottom:0;width:15px;cursor:col-resize;z-index:5;touch-action:none;display:flex;align-items:center;justify-content:center}",
			".pfe-resizer::before{content:'';width:3px;height:64px;border-radius:3px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));transition:background .16s ease,height .16s ease}",
			".pfe-resizer:hover::before,.pfe-resizer:active::before{background:var(--dsw-alias-brand-primary,#3b82f6);height:96px}",
			/* docked file browser — fills the native details column / floating drawer */
			".pfe-panel{display:flex;flex-direction:column;height:100%;min-width:0;background:var(--dsw-alias-bg-layer-2,#171a21);border-left:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,#e6e9ef)}",
			"@keyframes pfe-slide-in{from{transform:translateX(32px);opacity:.4}to{transform:translateX(0);opacity:1}}",
			".pfe-panel-header{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));flex:none}",
			".pfe-panel-title{flex:1;min-width:0;font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary,#e6e9ef);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".pfe-panel-title .path{color:var(--dsw-alias-label-secondary,#9aa3b2);font-weight:400}",
			".pfe-close-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid transparent;border-radius:8px;background:none;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;transition:background .16s ease,color .16s ease}",
			".pfe-close-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e6e9ef)}",
			".pfe-collapse-btn{width:32px;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
			/* toolbar */
			".pfe-toolbar{display:flex;gap:8px;align-items:center;padding:12px 18px 8px;flex:none}",
			".pfe-toolbar .pfe-path-input{flex:1;min-width:0}",
			/* breadcrumbs */
			".pfe-crumbs{display:flex;align-items:center;flex-wrap:nowrap;overflow-x:auto;gap:0;padding:2px 18px 10px;scrollbar-width:thin;flex:none}",
			".pfe-crumb{display:inline-flex;align-items:center;background:none;border:none;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;padding:3px 6px;border-radius:6px;font-size:12px;white-space:nowrap}",
			".pfe-crumb:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e6e9ef)}",
			".pfe-crumb.last{color:var(--dsw-alias-label-primary,#e6e9ef);font-weight:500}",
			".pfe-crumb-sep{color:var(--dsw-alias-label-secondary,#9aa3b2);opacity:.5;display:inline-flex;align-items:center;flex:none}",
			/* error */
			".pfe-error{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;margin:0 18px 8px;border:1px solid var(--dsw-alias-state-error-primary,rgba(255,120,120,.4));background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff7878) 10%,transparent);border-radius:8px;color:var(--dsw-alias-state-error-primary,#ff8080);font-size:12px;flex:none;word-break:break-all}",
			/* body: the file list fills the panel (simple, no preview) */
			".pfe-body{flex:1;display:flex;flex-direction:column;min-height:0;padding:0 18px;gap:10px}",
			".pfe-list-region{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base,rgba(0,0,0,.16))}",
			".pfe-list-toggle{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 12px;background:none;border:none;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;flex:none}",
			".pfe-list-toggle:hover{color:var(--dsw-alias-label-primary,#e6e9ef)}",
			".pfe-list-toggle .caret{display:inline-flex;align-items:center;justify-content:center;width:14px;flex:none;transition:transform .15s ease}",
			".pfe-list-toggle .caret.open{transform:rotate(90deg)}",
			".pfe-list{overflow-y:auto;flex:1;min-height:0;padding:0 2px 4px;display:flex;flex-direction:column;gap:1px;scrollbar-width:thin}",
			".pfe-group{display:flex;align-items:center;padding:9px 10px 3px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#9aa3b2);flex:none}",
			".pfe-row{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary,#e6e9ef);padding:7px 10px;border-radius:7px;cursor:pointer;font-size:13px;line-height:1.4;white-space:nowrap;overflow:hidden}",
			".pfe-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}",
			".pfe-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-1px}",
			".pfe-row-icon{flex:none;width:18px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
			".pfe-row-icon.dir{color:var(--dsw-alias-brand-primary,#5b9dff)}",
			".pfe-row-name{flex:1;overflow:hidden;text-overflow:ellipsis}",
			".pfe-row-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);margin-left:8px}",
			/* 改动标记：git 未提交改动的文件/文件夹行上的小圆点 */
			".pfe-row-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#34d399);margin-left:8px;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#34d399) 22%,transparent)}",
			/* 会话内改动文件条 */
			".pfe-changed{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:2px 0 6px;font-size:12px}",
			".pfe-changed-label{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}",
			".pfe-changed-chip{display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:3px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:999px;background:var(--dsw-alias-bg-layer-1,#1b1f27);color:var(--dsw-alias-brand-primary,#5b9dff);cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .15s ease,border-color .15s ease,color .15s ease}",
			".pfe-changed-chip::before{content:'●';font-size:8px;color:var(--dsw-alias-state-success-primary,#34d399);flex:none}",
			".pfe-changed-chip:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 12%,transparent);border-color:var(--dsw-alias-brand-primary,#3b82f6)}",
			".pfe-changed-more{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px}",
			/* 预览头部 diff 图例（新增/删除行数） */
			".pfe-diff-legend{display:inline-flex;align-items:center;gap:10px;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
			".pfe-diff-none{color:var(--dsw-alias-state-warn-primary,#f0b429);opacity:.9}",
			".pfe-legend-item{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}",
			".pfe-legend-dot{width:9px;height:9px;border-radius:3px;display:inline-block}",
			".pfe-legend-dot.add{background:rgba(34,197,94,.6)}",
			".pfe-legend-dot.del{background:rgba(239,68,68,.65)}",
			/* preview (used by the main-area preview tabs, NOT inside the panel) */
			".pfe-preview{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base,rgba(0,0,0,.22))}",
			".pfe-preview-head{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);flex:none;white-space:nowrap;overflow:hidden}",
			".pfe-preview-head .name{flex:1;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary,#e6e9ef);font-weight:500}",
			".pfe-preview-body{flex:1;overflow:auto;padding:10px 0;font-family:ui-monospace,'Cascadia Code',Consolas,Menlo,monospace;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary,#e6e9ef);margin:0;word-break:normal;tab-size:4;scrollbar-width:thin}",
			/* line numbers (IDE style) */
			".pfe-lines{min-width:max-content;display:flex;flex-direction:column}",
			".pfe-line{display:flex;align-items:stretch}",
			".pfe-ln{flex:none;width:52px;padding-right:14px;text-align:right;color:var(--dsw-alias-label-secondary,#9aa3b2);user-select:none;border-right:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));margin-right:16px;position:sticky;left:0;background:var(--dsw-alias-bg-base,#101319)}",
			".pfe-code{flex:1;white-space:pre;padding-right:16px}",
			/* diff highlights (AI 改动行：红=原本删除，绿=新增) */
			".pfe-diff-added{background:rgba(34,197,94,.13)}",
			".pfe-diff-removed{background:rgba(239,68,68,.15)}",
			".pfe-diff-added .pfe-ln{background:rgba(34,197,94,.13)}",
			".pfe-diff-removed .pfe-ln{background:rgba(239,68,68,.15)}",
			".pfe-ln-added{color:#4ade80}",
			".pfe-ln-removed{color:#f87171}",
			".pfe-diff-added .pfe-code{padding-left:10px;border-left:3px solid rgba(34,197,94,.65)}",
			".pfe-diff-removed .pfe-code{padding-left:10px;border-left:3px solid rgba(239,68,68,.7);text-decoration:line-through;text-decoration-color:rgba(239,68,68,.6)}",
			/* media previews: images, audio, video, pdf (tab content) */
			".pfe-preview-media{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}",
			".pfe-preview-media img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}",
			".pfe-preview-video{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;background:#000}",
			".pfe-preview-video video{max-width:100%;max-height:100%;border-radius:6px}",
			".pfe-preview-audio{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px}",
			".pfe-preview-audio audio{width:100%}",
			".pfe-preview-pdf{flex:1;min-height:0;width:100%;border:0}",
			".pfe-note{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:28px 16px;color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px;flex:1}",
			".pfe-status{display:flex;align-items:center;gap:8px;padding:10px 18px 0;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".pfe-footer{display:flex;align-items:center;gap:8px;padding:12px 18px 14px;flex:none;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));background:var(--dsw-alias-bg-base,rgba(0,0,0,.08))}",
			".pfe-footer-status{flex:0 1 auto;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".pfe-footer-sep{flex:1}",
			/* 底栏按钮：永远单行不折行；空间不足时文字省略号截断（不上下串位） */
			".pfe-open-btn{flex:0 0 auto;min-width:0;max-width:100%;white-space:nowrap}",
			".pfe-open-btn .pfe-btn-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".pfe-toggle-active{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#e6e9ef)}",
			/* conversation.view file tabs: shrink + scroll when many */
			".wSkVaW_tabs{gap:14px;overflow-x:auto;flex-wrap:nowrap;min-width:0;max-width:100%;scrollbar-width:thin}",
			".wSkVaW_tab{flex:0 1 auto;min-width:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			/* file preview view (tab content) */
			".pfe-view{display:flex;flex-direction:column;height:100%;min-height:0}",
			".pfe-view-head{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
			".pfe-view-head .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#e6e9ef);font-weight:500}",
			".pfe-view-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:7px;background:none;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;font-size:15px;line-height:1}",
			".pfe-view-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#e6e9ef)}",
			".pfe-view-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}",
			/* drag & drop: pointer-based custom drag (IDE style, avoids native DnD stuck cursor) */
			".pfe-ghost{position:fixed;z-index:1000;pointer-events:none;padding:7px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#1f242c);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 12px 32px rgba(0,0,0,.45);font-size:12px;color:var(--dsw-alias-label-primary,#e6e9ef);max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".pfe-drop-target{outline:2px dashed var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-2px}",
			".pfe-drop-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:1000;background:var(--dsw-alias-bg-layer-3,#1f242c);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:10px;padding:9px 14px;font-size:12px;color:var(--dsw-alias-label-primary,#e6e9ef);box-shadow:0 12px 32px rgba(0,0,0,.45);max-width:82vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity .3s ease}"
		].join("\n");
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(styleTagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = styleTagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		const { useState, useEffect, useCallback, useRef, useSyncExternalStore, Fragment } = react;
		const { jsx, jsxs } = jsxRuntime;

		function formatSize(bytes) {
			if (bytes < 1024) return bytes + " B";
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
			if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
			return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
		}

		/**
		 * 渲染代码行（带行号，可选 diff 高亮）。
		 * diff 为 host /project-files/read 返回的行级标注：红=removed（原本），
		 * 绿=added（新改）；无 diff 时按普通行号渲染。
		 */
		function renderCodeLines(content, diff) {
			if (diff && diff.length > 0) {
				return jsx("div", {
					className: "pfe-lines",
					children: diff.map((ln, i) => jsxs("div", {
						className: "pfe-line" + (ln.type === "removed" ? " pfe-diff-removed" : ln.type === "added" ? " pfe-diff-added" : ""),
						children: [
							jsx("span", {
								className: "pfe-ln" + (ln.type === "removed" ? " pfe-ln-removed" : ln.type === "added" ? " pfe-ln-added" : ""),
								children: ln.type === "context" ? String(ln.newLine) : ln.type === "added" ? String(ln.newLine) : String(ln.oldLine)
							}),
							jsx("span", { className: "pfe-code", children: ln.text })
						]
					}, i))
				});
			}
			return jsx("div", {
				className: "pfe-lines",
				children: content.split("\n").map((ln, i) => jsxs("div", {
					className: "pfe-line",
					children: [
						jsx("span", { className: "pfe-ln", children: String(i + 1) }),
						jsx("span", { className: "pfe-code", children: ln })
					]
				}, i))
			});
		}

		/**
		 * 渲染文件预览内容（文本 / 图片 / 音视频 / PDF / 二进制 / 超大）。
		 * 仅用于主会话区的预览标签，面板本身不做预览。
		 */
		function renderPreviewBody(preview, diff) {
			if (!preview) return null;
			if (preview.kind === "image") return jsx("div", { className: "pfe-preview-media", children: jsx("img", { src: preview.dataUrl, alt: preview.path }) });
			if (preview.kind === "video") return jsx("div", { className: "pfe-preview-video", children: jsx("video", { src: preview.dataUrl, controls: true }) });
			if (preview.kind === "audio") return jsx("div", { className: "pfe-preview-audio", children: jsx("audio", { src: preview.dataUrl, controls: true }) });
			if (preview.kind === "pdf") return jsx("iframe", { className: "pfe-preview-pdf", src: preview.dataUrl, title: preview.path });
			if (preview.kind === "binary") return jsx("div", { className: "pfe-note", children: [jsx(IconCodeOutline16, { size: 20 }), jsx("span", { children: "二进制文件，不支持在线预览（可在资源管理器中打开）" })] });
			if (preview.kind === "oversize") return jsx("div", { className: "pfe-note", children: [jsx(IconCodeOutline16, { size: 20 }), jsx("span", { children: "文件过大（>10MB），不支持在线预览（可在资源管理器中打开）" })] });
			return jsx("div", { className: "pfe-preview-body", children: renderCodeLines(preview.content, diff) });
		}

		function crumbsOf(path) {
			if (!path) return [];
			const parts = path.split(/[\\/]+/).filter((s) => s.length > 0);
			const out = [];
			let acc = "";
			for (let i = 0; i < parts.length; i++) {
				acc = i === 0 ? parts[i] : acc + "\\" + parts[i];
				out.push({ name: parts[i], path: acc });
			}
			return out;
		}

		/** 判断文件夹 p 是否位于根目录 root 之内（含相等；Windows 大小写不敏感）。 */
		function isInside(p, root) {
			if (!p || !root) return false;
			const norm = (s) => String(s).replace(/[\\/]+$/, "").toLowerCase();
			const s = norm(p);
			const r = norm(root);
			return s === r || s.startsWith(r + "\\") || s.startsWith(r + "/");
		}

		// ---------- file browser panel (simple list; docked in details column, or floating at root) ----------
		function FileBrowserPanel(props) {
			const { api, onClose, useSessions, useWorkspaces } = props;
			// 定位当前会话所属工作区（而不是全局“最近打开”）；无会话时退回最近/第一个。
			// cwd 用于把会话里的相对路径（如 lib/a.js）解析成绝对路径。
			const sessionInfo = useSessions((s) => {
				if (!s) return { current: undefined, cwd: undefined };
				const cur = s.current;
				return { current: cur, cwd: cur && s.byId ? s.byId[cur]?.cwd : undefined };
			});
			const sessionId = sessionInfo.current ?? props.sessionId;
			const sessionCwd = sessionInfo.cwd || null;
			const workspaceState = useWorkspaces((s) => s);
			const workspaceItems = workspaceState && Array.isArray(workspaceState.items) ? workspaceState.items : [];
			// 面板跟随的「锚点目录」推导：
			//   · 有当前会话时：锚点 = 会话自己的工作目录 cwd（会话在哪个文件夹工作，
			//     面板就显示哪个文件夹；归属工作区的会话 cwd 即工作区根目录，未分组/
			//     新建会话也用 cwd，绝不退回「最近工作区」——那会显示成上一个工作区）
			//   · 无会话（首页）时：最近工作区 → 第一个工作区 → 兜底
			let workspacePath = null;
			if (workspaceItems.length > 0) {
				if (sessionId) {
					const own = workspaceItems.find((w) => Array.isArray(w.sessionIds) && w.sessionIds.includes(sessionId));
					if (own && own.path) workspacePath = own.path;
				}
				if (!workspacePath && sessionCwd) {
					const cwdKey = String(sessionCwd).replace(/[\\/]+$/, "").toLowerCase();
					const byCwd = workspaceItems.find((w) => w.path && String(w.path).replace(/[\\/]+$/, "").toLowerCase() === cwdKey);
					if (byCwd && byCwd.path) workspacePath = byCwd.path;
				}
				if (!workspacePath && workspaceState.recentWorkspaceId != null) {
					const recent = workspaceItems.find((w) => w.workspaceId === workspaceState.recentWorkspaceId);
					if (recent && recent.path) workspacePath = recent.path;
				}
				if (!workspacePath && workspaceItems[0] && workspaceItems[0].path) {
					workspacePath = workspaceItems[0].path;
				}
			}
			const anchor = sessionId && sessionCwd ? sessionCwd : (workspacePath || sessionCwd);
			// 工作区列表指纹：宿主帧到达（会话归属更新）时让面板重新推导，而不是干等
			const workspaceSignature = workspaceItems.map((w) =>
				(w.workspaceId || "") + "|" + (w.path || "") + "|" + (Array.isArray(w.sessionIds) ? w.sessionIds.join(",") : "")
			).join(";");
			const [path, setPath] = useState(null);
			const [dirs, setDirs] = useState([]);
			const [files, setFiles] = useState([]);
			const [loading, setLoading] = useState(false);
			const [error, setError] = useState(null);
			const [pathInput, setPathInput] = useState("");
			const [opening, setOpening] = useState(false);
			const [listCollapsed, setListCollapsed] = useState(false);
			// 加载序号（单调递增）：作废在途的旧目录加载。切换工作区/会话后，旧工作区的
			// 慢响应（大目录 + git 扫描可能耗时数百毫秒甚至更久）不能覆盖新工作区的内容，
			// 否则面板会一直卡在“显示上一个文件夹”的状态。
			const loadSeqRef = useRef(0);

			const load = useCallback(async (target, fallbackTo) => {
				if (!target) return;
				const seq = ++loadSeqRef.current;
				setLoading(true);
				setError(null);
				try {
					const r = await api.listFiles(target);
					if (seq !== loadSeqRef.current) return; // 已被更新的加载取代，丢弃过期结果
					if (!r.ok) throw new Error(r.error || "list failed");
					setPath(r.path);
					setPathInput(r.path);
					setDirs(r.dirs || []);
					setFiles(r.files || []);
					// 只记住锚点内的目录；手动浏览到工作区外面（如 .caches）不会被记住，
					// 否则下次切回该工作区时会错误地恢复成那个外部目录
					if (!anchor || isInside(r.path, anchor)) rememberFolder(anchor, r.path);
				} catch (e) {
					if (seq !== loadSeqRef.current) return;
					// 目标文件夹不存在/不可读（可能已被删除，或记忆的文件夹已失效）：
					// 有回退目标时自动退回（只退一次），避免面板卡死在报错状态。
					if (fallbackTo && fallbackTo !== target) {
						return load(fallbackTo);
					}
					setError(e && e.message ? e.message : String(e));
					setDirs([]);
					setFiles([]);
				} finally {
					if (seq === loadSeqRef.current) setLoading(false);
				}
			}, [api, anchor]);

			// 挂载即恢复上次浏览的文件夹（按锚点记忆）；没有记忆则加载锚点根目录。
			// 面板常驻 details 列、不会随工作区切换重挂载：锚点变化时必须主动
			// 重新指向新工作区，否则会一直停留在旧工作区的目录（点「刷新」也只是
			// 重刷旧路径）。规则：正在浏览的目录已在锚点内 → 保持不动（用户正在
			// 浏览新工作区内部）；否则恢复锚点记忆，记忆失效时由 load 回退到锚点。
			// 记忆的文件夹若已不在锚点内（比如上一个会话里手动浏览过别处、路径被
			// 记到了当前工作区名下），直接显示锚点根目录，绝不复用旧目录。
			// 锚点变化时同时作废所有在途加载，防止旧工作区的慢响应覆盖新内容。
			const prevAnchorRef = useRef(undefined);
			useEffect(() => {
				const prev = prevAnchorRef.current;
				prevAnchorRef.current = anchor;
				if (prev === anchor) return; // 锚点未变化（首次挂载前 prev 为 undefined）
				loadSeqRef.current++; // 作废在途的旧目录加载
				if (!anchor) {
					// 无锚点（无会话且无工作区）：不打断当前浏览；若从未浏览过则恢复全局记忆
					if (!path) {
						const saved = lastFolders["_"];
						if (saved) load(saved);
					}
					return;
				}
				if (path && isInside(path, anchor)) return; // 已在锚点内
				const saved = lastFolders[anchor];
				const target = saved && isInside(saved, anchor) ? saved : anchor;
				load(target, anchor);
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [anchor, sessionId, workspaceSignature]);

			// 跳转打开：会话里点「改动文件」→ 面板定位到该文件所在目录并打开（带 diff 标注）
			const jump = useSyncExternalStore(subscribeJump, getJumpTarget);
			const lastJumpAt = useRef(0);
			const resolveAbs = (p) => {
				if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\")) return p;
				// 相对路径 → 按当前会话 cwd 解析
				if (sessionInfo.cwd) return String(sessionInfo.cwd).replace(/[\\/]+$/, "") + "\\" + p;
				return p;
			};
			useEffect(() => {
				if (!jump || jump.at === lastJumpAt.current) return;
				lastJumpAt.current = jump.at;
				const abs = resolveAbs(jump.path);
				const dir = abs.replace(/[\\/][^\\/]*$/, "");
				if (dir && dir !== abs) load(dir);
				if (sessionId) openFileTab({ path: abs, name: jump.name }, sessionId);
				else {
					api.openPath(abs).catch(() => { /* 无会话时无法打开则忽略 */ });
				}
			}, [jump]);

			// 浏览：打开系统文件夹选择器，把所选文件夹加载进面板浏览。
			const pick = async () => {
				setError(null);
				try {
					const picked = await api.pickDirectory();
					if (picked) load(picked);
				} catch (e) {
					setError(e && e.message ? e.message : String(e));
				}
			};

			// 有会话 → 在主区打开预览标签；无会话 → 交给系统默认应用打开。
			const openFile = async (f) => {
				if (sessionId) {
					openFileTab(f, sessionId);
				} else {
					setError(null);
					try {
						await api.openPath(f.path);
					} catch (e) {
						setError(e && e.message ? e.message : String(e));
					}
				}
			};

			// 在资源管理器中打开：面板当前所在文件夹，在系统资源管理器中同步打开。
			const openHere = async (target) => {
				setOpening(true);
				setError(null);
				try {
					await api.openPath(target);
				} catch (e) {
					setError(e && e.message ? e.message : String(e));
				} finally {
					setOpening(false);
				}
			};

			const crumbs = crumbsOf(path);
			const rowIcon = (icon, extra) => jsx("span", { className: "pfe-row-icon " + (extra || ""), children: icon });

			const listBody = loading
				? jsx("div", { className: "pfe-note", children: "加载中…" })
				: (dirs.length === 0 && files.length === 0)
					? jsxs("div", {
						className: "pfe-note",
						children: [
							jsx(IconFolderOpenOutline16, { size: 20 }),
							jsx("span", { children: "此文件夹为空" })
						]
					})
					: jsxs(Fragment, {
						children: [
							dirs.length > 0
								? jsxs(Fragment, {
									children: [
										jsx("div", { className: "pfe-group", children: "文件夹 · " + dirs.length }),
										dirs.map((d) => jsx("button", {
											className: "pfe-row",
											title: d.path,
											onMouseDown: pfeRowMouseHandlers(d),
											onClick: () => load(d.path),
											children: [
												rowIcon(jsx(IconFolderOpen16, { size: 16 }), "dir"),
												jsx("span", { className: "pfe-row-name", children: d.name }),
												d.changed ? jsx("span", { className: "pfe-row-dot", title: "此文件夹内有改动" }) : null
											]
										}, d.path))
									]
								})
								: null,
							files.length > 0
								? jsxs(Fragment, {
									children: [
										jsx("div", { className: "pfe-group", children: "文件 · " + files.length }),
										files.map((f) => jsx("button", {
											className: "pfe-row",
											title: f.path,
											onMouseDown: pfeRowMouseHandlers(f),
											onClick: () => openFile(f),
											children: [
												rowIcon(jsx(IconCodeOutline16, { size: 16 })),
												jsx("span", { className: "pfe-row-name", children: f.name }),
												f.changed ? jsx("span", { className: "pfe-row-dot", title: "此文件有改动" }) : null,
												jsx("span", { className: "pfe-row-meta", children: formatSize(f.size) })
											]
										}, f.path))
									]
								})
								: null
						]
					});

			const statusLine = path
				? dirs.length + " 个文件夹 · " + files.length + " 个文件"
				: "";

			return jsxs("div", {
				className: "pfe-panel",
				role: "dialog",
				"aria-label": "项目文件浏览器",
				children: [
					jsxs("div", {
						className: "pfe-panel-header",
						children: [
							jsx("div", {
								className: "pfe-panel-title",
								children: [
									"项目文件",
									path ? jsx("span", { className: "path", children: " · " + path }) : null
								]
							}),
							jsx("button", {
								className: "pfe-close-btn pfe-collapse-btn",
								"aria-label": "收起项目文件面板",
								title: "收起（缩回右侧）",
								onClick: onClose,
								children: jsx(IconChevronRightOutline14, { size: 16 })
							})
						]
					}),
					jsxs("div", {
						className: "pfe-toolbar",
						children: [
							jsx(Button, {
								variant: "outline",
								size: "sm",
								icon: jsx(IconBrowseOutline16, { size: 16 }),
								onClick: pick,
								title: "选择其他文件夹在面板中浏览",
								children: "浏览"
							}, "btn-pick"),
							jsx(Input, {
								className: "pfe-path-input",
								icon: jsx(IconSearchOutline16, { size: 16 }),
								placeholder: "文件夹路径，如 C:\\MyProject",
								value: pathInput,
								onChange: (e) => setPathInput(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") load(pathInput);
								}
							}),
							jsx(Button, {
								variant: "ghost",
								size: "sm",
								icon: jsx(IconRefreshOutline14, { size: 14 }),
								onClick: () => load(path, anchor),
								disabled: !path,
								title: "刷新"
							}, "btn-refresh")
						]
					}),
					crumbs.length > 0
						? jsxs("div", {
							className: "pfe-crumbs",
							children: crumbs.map((c, i) =>
								jsxs(Fragment, { children: [
									jsx("button", {
										className: "pfe-crumb" + (i === crumbs.length - 1 ? " last" : ""),
										onClick: () => load(c.path),
										children: c.name
									}, c.path + "#crumb"),
									i < crumbs.length - 1
										? jsx("span", { className: "pfe-crumb-sep", children: jsx(IconChevronRightOutline14, { size: 12 }) }, c.path + "#sep")
										: null
								]}, c.path + "#pair")
							)
						})
						: null,
					error
						? jsxs("div", {
							className: "pfe-error",
							children: [
								jsx("span", { style: { flex: "none" }, children: "⚠" }),
								jsx("span", { children: error })
							]
						})
						: null,
					jsxs("div", {
						className: "pfe-body",
						children: [
							jsxs("div", {
								className: "pfe-list-region",
								children: [
									jsxs("button", {
										className: "pfe-list-toggle",
										onClick: () => setListCollapsed(!listCollapsed),
										"aria-expanded": !listCollapsed,
										children: [
											jsx("span", { className: "caret" + (listCollapsed ? "" : " open"), children: jsx(IconChevronRightOutline14, { size: 12 }) }),
											jsx("span", { children: "文件列表 · " + (dirs.length + files.length) })
										]
									}),
									listCollapsed
										? null
										: jsx("div", { className: "pfe-list", children: listBody })
								]
							})
						]
					}),
					jsxs("div", {
						className: "pfe-footer",
						children: [
							jsx("span", { className: "pfe-footer-status", children: statusLine }),
							jsx("div", { className: "pfe-footer-sep" }),
							jsx(Button, {
								variant: "primary",
								size: "sm",
								className: "pfe-open-btn",
								icon: jsx(IconFolderOpenOutline16, { size: 16 }),
								onClick: () => openHere(path),
								disabled: opening || !path,
								title: "在系统资源管理器中打开当前文件夹",
								children: jsx("span", { className: "pfe-btn-label", children: opening ? "打开中…" : "在资源管理器中打开" })
							}, "btn-open")
						]
					})
				]
			});
		}

		// ---------- root entry: right-edge tab (collapsed) ⟷ docked details column ⟷ floating drawer ----------
		function DrawerEntry(props) {
			const { api, onOpenDock, onClosePanel } = props;
			const open = useSyncExternalStore(subscribePanel, getPanelOpen);
			const width = useSyncExternalStore(subscribeWidth, getDrawerWidth);
			const sessionId = props.useSessions((s) => (s ? s.current : undefined));
			// 会话出现时把面板停靠到原生 details 列（对话区随之收缩）
			useEffect(() => {
				if (open && sessionId) onOpenDock();
			}, [open, sessionId]);
			if (!open) {
				// 最右缘的细长箭头按钮：点击一次即展开右侧项目文件面板。
				return jsx("div", {
					className: "pfe-tab-wrap",
					children: jsx("button", {
						className: "pfe-tab",
						type: "button",
						"aria-label": "展开项目文件面板",
						title: "展开项目文件面板",
						onClick: onOpenDock,
						children: [
							jsx("span", { className: "pfe-tab-icon", children: jsx(IconFolderOpenOutline16, { size: 18 }) }),
							jsx("span", { className: "pfe-tab-label", children: "项目文件" }),
							jsx("span", { className: "pfe-tab-arrow", children: jsx(IconChevronLeftOutline14, { size: 12 }) })
						]
					})
				});
			}
			if (sessionId) return null; // 有会话：面板已停靠在 details 列
			// 无会话（首页）：右侧浮层兜底，左缘可见把手拖动调宽
			const startResize = (e) => {
				e.preventDefault();
				const startX = e.clientX;
				const startW = getDrawerWidth();
				const onMove = (ev) => setDrawerWidth(startW - (ev.clientX - startX));
				const onUp = () => {
					document.removeEventListener("pointermove", onMove);
					document.removeEventListener("pointerup", onUp);
					document.body.style.userSelect = "";
					document.documentElement.style.cursor = "";
				};
				document.body.style.userSelect = "none";
				document.documentElement.style.cursor = "col-resize";
				document.addEventListener("pointermove", onMove);
				document.addEventListener("pointerup", onUp);
			};
			return jsxs("div", {
				className: "pfe-drawer",
				style: { width: width + "px" },
				role: "complementary",
				"aria-label": "项目文件",
				tabIndex: -1,
				onKeyDown: (e) => {
					if (e.key === "Escape") onClosePanel();
				},
				children: [
					jsx("div", { className: "pfe-resizer", onPointerDown: startResize, title: "拖动调整面板宽度", "aria-hidden": true }),
					jsx(FileBrowserPanel, { api, onClose: onClosePanel, useSessions: props.useSessions, useWorkspaces: props.useWorkspaces })
				]
			});
		}

		// ---------- file preview tab content (rendered inside conversation.view) ----------
		// sessionId 由 conversation.view 槽位的标准属性提供（当前会话），传给 readFile
		// 让 Host 从会话日志还原 AI 改动前的旧内容做颜色标注。
		function FilePreviewView({ api, tab, sessionId }) {
			const [state, setState] = useState({ loading: true, preview: null, error: null, diff: null, sid: null });
			useEffect(() => {
				let alive = true;
				setState({ loading: true, preview: null, error: null, diff: null, sid: null });
				const usedSession = tab.sessionId || sessionId;
				api.readFile(tab.path, usedSession)
					.then((r) => {
						if (!alive) return;
						if (!r.ok) setState({ loading: false, error: r.error || "read failed", sid: usedSession });
						else {
							const preview = { path: r.path, kind: r.kind, dataUrl: r.dataUrl, content: r.content, size: r.size, truncated: r.truncated };
							// read 已附带会话/快照对比 diff（标注 AI 改动行）
							setState({
								loading: false,
								preview,
								error: null,
								sid: usedSession,
								diff: r.kind === "text" && r.diff && r.diff.changed && Array.isArray(r.diff.lines) ? r.diff.lines : null
							});
						}
					})
					.catch((e) => {
						if (alive) setState({ loading: false, error: e && e.message ? e.message : String(e), sid: usedSession });
					});
				return () => { alive = false; };
			}, [api, tab.path, tab.sessionId, sessionId]);
			const { loading, preview, error, diff, sid } = state;
			// Trae 风格图例：新增/删除行数，一目了然；无 diff 时给出诊断徽标
			let legend = null;
			if (diff && diff.length > 0) {
				let added = 0, removed = 0;
				for (const ln of diff) {
					if (ln.type === "added") added++;
					else if (ln.type === "removed") removed++;
				}
				if (added > 0 || removed > 0) {
					legend = jsxs("span", {
						className: "pfe-diff-legend",
						children: [
							added > 0 ? jsx("span", { className: "pfe-legend-item", children: [jsx("i", { className: "pfe-legend-dot add" }), "新增 " + added] }) : null,
							removed > 0 ? jsx("span", { className: "pfe-legend-item", children: [jsx("i", { className: "pfe-legend-dot del" }), "删除 " + removed] }) : null
						]
					});
				}
			}
			if (!loading && !error && legend === null && preview && preview.kind === "text") {
				legend = jsx("span", {
					className: "pfe-diff-legend pfe-diff-none",
					title: "Host 未返回改动行标注",
					children: "无改动标注 · 会话 " + (sid ? String(sid).slice(0, 8) + "…" : "空")
				});
			}
			let body;
			if (loading) body = jsx("div", { className: "pfe-note", children: "加载中…" });
			else if (error) body = jsx("div", { className: "pfe-note", children: [jsx(IconCodeOutline16, { size: 20 }), jsx("span", { children: error })] });
			else body = renderPreviewBody(preview, diff);
			return jsxs("div", {
				className: "pfe-view",
				children: [
					jsxs("div", {
						className: "pfe-view-head",
						children: [
							jsx("span", { className: "name", children: preview ? preview.path : tab.path }),
							legend,
							jsx("button", {
								className: "pfe-view-close",
								title: "关闭标签",
								onClick: () => closeFileTab(tab.id),
								children: "\u00d7"
							})
						]
					}),
					jsx("div", { className: "pfe-view-body", children: body })
				]
			});
		}

		// ---------- 会话内「改动文件」条：AI 每轮改动的文件，点击跳转到面板打开 ----------
		// 数据来自收尾回合的 deliverables 投影（引擎按工具调用折叠的成功修改路径，
		// 无需 git）；读取失败或该回合无改动时自动放弃挂载。
		function selectChangedFiles(owner) {
			try {
				const data = owner && owner.turn && owner.turn.data && typeof owner.turn.data.get === "function"
					? owner.turn.data.get("deliverables")
					: undefined;
				if (!data || !Array.isArray(data.produced)) return null;
				const seq = owner.seq == null ? Number.POSITIVE_INFINITY : owner.seq;
				const paths = [];
				const seen = new Set();
				for (const p of data.produced) {
					if (!p || typeof p.path !== "string") continue;
					if (p.seq > seq || seen.has(p.path)) continue;
					seen.add(p.path);
					paths.push(p.path);
				}
				return paths.length === 0 ? null : paths;
			} catch { return null; }
		}

		function ChangedFilesStrip({ matched }) {
			const paths = Array.isArray(matched) ? matched : [];
			if (paths.length === 0) return null;
			const MAX = 6;
			const shown = paths.slice(0, MAX);
			const more = paths.length - shown.length;
			return jsxs("div", {
				className: "pfe-changed",
				children: [
					jsx("span", { className: "pfe-changed-label", children: "改动文件" }),
					shown.map((p) => jsx("button", {
						type: "button",
						className: "pfe-changed-chip",
						title: p + "（点击在「对话/轨迹」标签栏打开，带改动行颜色标注）",
						onClick: () => jumpToFile(p),
						children: baseNameOf(p)
					}, p)),
					more > 0 ? jsx("span", { className: "pfe-changed-more", children: "+ " + more + " 个" }) : null
				]
			});
		}

		// ---------- plugin body ----------
		function apply(ctx) {
			// 供内置「产物」文件链接（deliverables）调用：点文件在主区标签打开（带改动标注）
			try {
				window.__projectFileExplorerOpen = (p) => jumpToFile(p);
			} catch (e) { /* 非浏览器环境忽略 */ }
			layoutOpenFn = () => {
				try { ctx.layout.openDetails(); } catch (e) { /* layout 尚未就绪 */ }
			};
			// 当前会话 id：用于 read 时让 Host 从会话日志还原 AI 改动前的旧内容
			const currentSessionId = () => {
				try {
					const snap = ctx.get("sessions")?.list?.getSnapshot();
					return snap ? snap.current : undefined;
				} catch { return undefined; }
			};
			const api = () => ({
				listFiles: async (path) => {
					const s = currentSessionId();
					const url = "/project-files/list?path=" + encodeURIComponent(path) + (s ? "&session=" + encodeURIComponent(s) : "");
					const r = await fetch(url, { cache: "no-store" });
					return r.json();
				},
				readFile: async (path, sessionOverride) => {
					// 优先用调用方传入的会话 id（槽位标准属性，最可靠）；否则回退快照
					const s = sessionOverride || currentSessionId();
					const url = "/project-files/read?path=" + encodeURIComponent(path) + (s ? "&session=" + encodeURIComponent(s) : "");
					const r = await fetch(url, { cache: "no-store" });
					return r.json();
				},
				pickDirectory: () => ctx.workspaces.pickDirectory(),
				openPath: (path) => ctx.workspaces.openPath(path)
			});
			// 面板开/关：开 → 停靠原生 details 列（对话区收缩）；关 → 收起并释放右列。
			const openPanel = () => {
				setPanelOpen(true);
				try { ctx.layout.openDetails(); } catch (e) { /* layout 尚未就绪 */ }
			};
			const closePanel = () => {
				setPanelOpen(false);
				try { ctx.layout.closeDetails(); } catch (e) { /* layout 尚未就绪 */ }
			};
			// conversation.view 标签：点击文件时动态注册/注销（主会话区「对话/轨迹」旁的文件标签）
			const tabDisposers = new Map();
			registerTab = (tab) => {
				const dispose = ctx.slots.register({
					name: "conversation.view",
					id: tab.id,
					order: 100,
					label: tab.name,
					inject: () => ({ api: api(), tab })
				}, FilePreviewView);
				tabDisposers.set(tab.id, dispose);
			};
			disposeTab = (id) => {
				tabDisposers.get(id)?.();
				tabDisposers.delete(id);
			};
			closeDock = () => closePanel();
			// 面板停靠在原生 details 右列（single 槽位，priority -1 最低者渲染）：
			// 对话区宽度随停靠面板自动收缩/还原，自带原生 300-520px 调宽把手。
			// useSessions/useWorkspaces 由 slot 标准套件提供，注入只给业务属性。
			ctx.slots.inject("details", () => ctx.slots.register({
				name: "details",
				priority: -1,
				inject: () => ({
					api: api(),
					onClose: closePanel
				})
			}, FileBrowserPanel));
			// 根级入口：最右缘小按钮（shell.overlay，无需进入会话）。有会话时停靠
			// details 列；无会话（首页）时右侧浮层兜底。
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "project-file-explorer",
				order: 100,
				inject: () => ({
					api: api(),
					onOpenDock: () => { setPanelOpen(true); try { ctx.layout.openDetails(); } catch (e) { /* layout 尚未就绪 */ } },
					onClosePanel: () => { setPanelOpen(false); try { ctx.layout.closeDetails(); } catch (e) { /* layout 尚未就绪 */ } }
				})
			}, DrawerEntry));
			// 会话内「改动文件」条：每轮收尾消息下方列出 AI 改动的文件，点击跳转打开
			ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				select: selectChangedFiles,
				inject: () => ({})
			}, ChangedFilesStrip));
			// 新工作区出现时自动展开右侧面板（用户新建文件夹/工作区后直接看到内容）
			const seenWorkspaces = new Set();
			try {
				const wsSnap = ctx.workspaces.list.getSnapshot();
				if (wsSnap && Array.isArray(wsSnap.items)) for (const w of wsSnap.items) seenWorkspaces.add(w.workspaceId);
			} catch (e) { /* 工作区列表尚未就绪 */ }
			ctx.effect(() => ctx.workspaces.list.subscribe(() => {
				const snap = ctx.workspaces.list.getSnapshot();
				if (!snap || !Array.isArray(snap.items)) return;
				for (const w of snap.items) {
					if (seenWorkspaces.has(w.workspaceId)) continue;
					seenWorkspaces.add(w.workspaceId);
					openPanel();
				}
			}), "project-file-explorer: new-workspace drawer");
			// 启动默认收起（panelOpen=false）：不再自动打开右列，重启后界面正常呈现，
			// 无浮层→停靠的跳变；用户点最右缘小按钮或改动文件/产物链接时再展开。
		}
		exports.apply = apply;
		// 重要：exports.inject 必须是 cordis 服务名（本插件用到 ctx.slots、ctx.workspaces
		// 与 ctx.layout）。绝不能写成 npm 包名（如 @deepseek-ai/...），否则 web boot 会报
		// "pending (waiting for services: ...)" 并失败。
		exports.inject = ["slots", "workspaces", "layout"];
		return module.exports;
	}
});
