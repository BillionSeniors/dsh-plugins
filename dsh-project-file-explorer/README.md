# dsh-project-file-explorer

> **作者：亿哲学长**（GitHub: [BillionSeniors](https://github.com/BillionSeniors)）· 版权所有，禁止侵权转载

DeepSeek Harness (dsh) 的**项目文件浏览器**插件：屏幕最右缘常驻一个小箭头按钮，点击从右侧展开项目文件树（无需进入会话）；点击文件在主会话区打开预览标签，支持代码 / 文本 / 图片 / 音视频 / PDF。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 演示视频

📺 点击观看插件功能演示视频（哔哩哔哩）：**[【亿哲学长】DeepSeek Harness 项目文件浏览器插件演示](https://www.bilibili.com/video/BV1UUgP6pEm6/)**

## 功能特性

- **右侧停靠文件树**：屏幕**最右缘常驻一个小箭头按钮**，点一下即展开当前工作区的项目文件树；有会话时面板**停靠在右侧详情列，中间对话区自动让出宽度**（自带原生 300-520px 调宽把手），无会话（首页）时右侧浮层兜底 —— **不需要进入会话**，首页/任意页面都能直接点开文件；面板头部有「收起」按钮（箭头向右），点击缩回
- **跟随当前会话工作区**：切换到哪个工作区，右侧就显示哪个文件夹；**新建工作区自动弹出**对应目录
- **一键打开预览**：点击文件即自动打开预览标签，无需再手动点击标签
- **标签式预览**：文件名显示在「对话 / 轨迹」旁边，多文件往右排、自动缩窄
- **媒体支持**：图片 / 音视频 / PDF 在浏览器内直接渲染（data URL），不再显示乱码
- **图片识别（可选配套）**：配合 [dsh-vision-router](https://www.npmjs.com/package/dsh-vision-router) 插件使用——**DeepSeek 负责推理、视觉模型负责看图**，粘贴图片即可让 AI 识别 / 问答 / 定位；视觉后端可配置为**豆包（Doubao）**等图像理解模型
- **安全预览**：超大文件 / 二进制文件给出友好提示，不卡界面
- **Trae 风格改动标注**：打开 AI 改过的文件，预览里**绿色=新增行、红色=删除行、普通=原文**，预览头部显示「新增 n · 删除 m」图例 —— 数据直接来自**本会话 AI 的编辑记录**（不需要 git，第一次打开就能看到）；git 仓库内自动升级为 git diff（含未提交改动）
- **改动文件可点击跳转**：每轮 AI 收尾消息下方出现「改动文件」标签，点击任意文件即在右侧面板定位并打开（带颜色标注）
- **未分组可删除**：侧边栏「未分组」提供与普通工作区一致的删除能力（归档桶内孤儿会话）
- **面板可调宽**：拖动抽屉左缘把手，宽度 320-560px 可缩放
- **会话切换不收起**：切换对话时右侧面板保持展开
- **跨盘符可移植**：插件与安装/补丁脚本不写死任何盘符路径，全部基于 `$DSH_HOME`（未设置时 `~/.dsh`）与相对路径 —— 放在 C:/D:/E: 等任意盘符的 dsh 上都能一键安装
- **幂等补丁脚本**：一键应用 / 检查 harness 补丁，升级 dsh 后可重复运行

## 更新日志

### v1.2.1（2026-08-16）

- **修复**：删除全部工作区回归默认场景（无会话首页）后，右侧会出现一块**空白面板 + 全屏遮罩**，盖住「项目文件」浮层 —— 原因是详情列窄屏抽屉补丁在**无会话**时也会渲染，而 details 槽（session 作用域）此时内容为空。现在抽屉降级只在有会话时生效，无会话时由首页浮层正常接管
- **补丁脚本升级**：`patch-harness.mjs` 新增幂等修复补丁（`layout-mobiledrawer-nosession`），**旧机器重跑一次脚本即可修复**，全新安装自动带上修复
- **图片识别（可选配套）**：配合 [dsh-vision-router](https://www.npmjs.com/package/dsh-vision-router) 实现图片识别能力——视觉后端可配置为**豆包（Doubao）**等图像理解模型，DeepSeek 只负责推理，粘贴图片即可让 AI 看图

### v1.2.0（2026-08-15）

本次更新重点：**AI 改动标注** 与 **跨盘符一键安装**。

- **AI 改动标注（三源 diff）**：打开 AI 改过的文件，预览里**绿色=新增行、红色=删除行、普通=原文**，预览头部显示「新增 n · 删除 m」图例。数据来源自动择优：
  - ① **本会话 AI 编辑记录**（逆向还原，不需要 git，第一次打开就能看到）
  - ② **git diff**（文件在 git 仓库时自动升级，含未提交改动）
  - ③ **快照对比**（兜底：对比上次打开时的缓存内容）
- **改动文件可点击跳转**：每轮 AI 收尾消息下方出现「改动文件」标签，点击任意文件即在右侧面板定位并打开（带颜色标注）
- **屏幕右缘常驻入口**：无需进入会话，首页任意页面都能直接点开文件树
- **首页浮层模式**：无会话（首页）时面板以右侧浮层呈现，按 `Esc` 或「收起」按钮关闭
- **内置「产物」链接主区打开**：dsh 内置产物面板里的文件链接，点击改为在主区标签打开（带改动标注），插件未加载时退回系统默认打开
- **面板可调宽**：拖动抽屉左缘把手，宽度 320-560px 可缩放
- **跨盘符 / 跨机器安装**：插件、安装脚本、补丁脚本**不写死任何盘符路径**，全部基于 `$DSH_HOME`（未设置时 `~/.dsh`）自动定位 —— dsh 装在 C:/D:/E: 任意盘符都能一键安装
- **修复**：全新 DSH_HOME 首次安装时自动创建 profile 目录（此前会写文件失败）；消除 Windows 下 `npm root -g` 自动定位的弃用警告

### v1.1.0（2026-08-14）

在早期版本基础上新增 / 增强的功能：

- **右侧停靠文件树**：点击会话区顶部「项目文件」按钮，右侧停靠当前工作区文件树，宽度 300-520px 可缩放
- **跟随工作区 + 自动弹出**：切换工作区自动刷新文件树；**新建工作区自动停靠弹出**对应目录
- **一键预览**：点击文件即自动打开预览标签并激活，无需手动点击标签；多文件标签往右排、自动缩窄
- **媒体渲染**：图片 / 音视频 / PDF 以 data URL 在浏览器内直接渲染，不再显示乱码
- **安全预览**：超大文件 / 二进制文件给出友好提示，不卡界面
- **「未分组」可删除**：harness 补丁让「未分组」支持删除，一键归档桶内全部孤儿会话
- **会话切换不收起**：详情列始终跟随当前会话，切换对话时右侧面板保持停靠
- **窄屏响应式抽屉**：手机 / 窄屏下详情列自动降级为右侧抽屉 + 半透明遮罩，打开文件自动收起
- **幂等安装**：`npm run install` 一条命令完成 复制插件 + 注册 + 应用补丁，重复运行自动跳过；升级 dsh 后重新运行即可

> 插件与补丁基于 `@deepseek-ai/dsh` `0.1.0-rc.6` 打包产物编写。

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| DeepSeek Harness | `dsh` 最新版 | `npm install -g @deepseek-ai/dsh` |
| Node.js | >= 18 | 运行补丁脚本 |
| 操作系统 | Windows / macOS / Linux | 使用 `dsh web` |

> 插件与补丁基于 `@deepseek-ai/dsh` 的 `dsh-client-ui-workspace` / `dsh-client-ui-layout` `0.1.0-rc.6` 打包产物编写；补丁脚本会检测源码片段，版本不一致时给出提示。

## 安装

安装前请确认目标电脑已安装 DeepSeek Harness（`npm install -g @deepseek-ai/dsh`）与 Node.js >= 18。

### 方式 A：一键安装（推荐）

获取插件后，在插件目录里运行一条命令即可完成复制 + 注册 + 打补丁：

```bash
cd dsh-project-file-explorer
npm run install        # 复制到 profile、注册 cordis.patch.yml、应用补丁（全部幂等）
dsh web                # 重启启动
```

> `npm run install` 等价于 `node scripts/install.mjs`。可选参数：
> `--profile <dir>` 指定 dsh profile（默认 `~/.dsh/profiles/web`）、`--target <dir>` 指定依赖目录、`--skip-patch` 跳过补丁。
> 在另一台电脑上安装时：把整个文件夹拷过去（U 盘 / 局域网），进入文件夹执行上面的命令即可。

### 方式 B：手动安装

### 1. 获取插件

```bash
git clone https://github.com/<你的用户名>/dsh-project-file-explorer.git
# 或直接下载 ZIP 并解压
```

### 2. 复制插件到 dsh profile

```bash
# Linux / macOS
mkdir -p ~/.dsh/profiles/node_modules/@local
cp -r dsh-project-file-explorer ~/.dsh/profiles/node_modules/@local/

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.dsh\profiles\node_modules\@local" | Out-Null
Copy-Item -Recurse dsh-project-file-explorer "$env:USERPROFILE\.dsh\profiles\node_modules\@local\"
```

### 3. 注册插件

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，追加：

```yaml
- insert:
    - id: project-file-explorer
      name: '@local/dsh-project-file-explorer'
```

完整示例见 [`example/cordis.patch.yml`](example/cordis.patch.yml)。

### 4. 应用 harness 补丁（获取全部效果）

```bash
cd dsh-project-file-explorer
npm run patch     # 应用补丁（幂等，可重复运行）
npm run check     # 只检查是否已应用，不写入
```

### 5. 启动

```bash
dsh web
```

浏览器打开 `http://127.0.0.1:3080`，点击屏幕最右缘的小箭头按钮即可展开右侧项目文件面板。

## 使用

1. **打开面板**：屏幕**最右缘**有一个细长的小箭头按钮（文件夹图标 + 「项目文件」竖排文字 + 左箭头），点击一次即从右侧展开当前工作区的项目文件树；首页（未进入会话）也能直接打开
2. **收起面板**：点面板头部右侧的「收起」按钮（右箭头），面板缩回最右缘；按 `Esc` 同样可以收起
3. **浏览文件**：点击文件夹进入 / 返回；顶部「**浏览**」按钮可打开系统文件夹选择器切换目录，旁边是路径输入框和刷新按钮
4. **打开文件**：点击文件 → 有会话时在主区「对话 / 轨迹」旁打开预览标签（代码/文本、图片、音视频、PDF 直接渲染，二进制/超大文件友好提示）；无会话（首页）时用系统默认应用打开
5. **在资源管理器中打开**：面板底部的状态栏右侧按钮，把当前所在文件夹在系统资源管理器中同步打开（左侧显示文件统计，不再有空白）
6. **停靠调宽**：有会话时面板停靠在右侧详情列，**拖动右列分隔线**即可调宽 300-520px（原生把手）；无会话的首页浮层可拖左缘把手调宽
6. **新建工作区**：创建新的工作区 / 文件夹后右侧自动展开对应目录

## 跨盘符 / 跨机器安装

插件本体、安装脚本与补丁脚本**均不写死盘符路径**：

- 安装目标用 `$DSH_HOME`（未设置时默认 `~/.dsh`），无论 dsh 装在 C:/D:/E: 哪个盘符都能正确安装
- `npm run install` 通过 `$DSH_HOME` / `npm root -g` 自动定位依赖目录，也可用 `--target` 手动指定
- 直接把整个 `dsh-project-file-explorer` 文件夹拷到其他电脑（U 盘 / 局域网 / GitHub）即可使用

> 上传 GitHub 前，建议删除插件目录里的 `.git` 文件夹（原作者的仓库历史），避免与你的新仓库冲突。

## 为什么需要补丁脚本？

插件核心（`lib/`）通过 dsh 的 slots 服务即可加载，但完整效果需要微调 dsh 自带的两个打包组件：

| 补丁目标 | 改动 | 作用 |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-ui-workspace` | 未分组菜单 / 删除动作 / 归档逻辑 | 「未分组」支持删除 |
| `@deepseek-ai/dsh-client-ui-layout` | 详情列跟随会话 / 不自动收起 / 抽屉渲染 | 空白会话也停靠、切换不收起、窄屏响应式 |

补丁**直接修改 node_modules 内打包产物**，所以：

- 升级 / 重装 `@deepseek-ai/dsh` 后，请重新运行 `npm run patch`
- 脚本是**幂等**的：已打过的补丁自动跳过（检测 marker 注释）
- dsh 大版本升级导致源码片段变化时，脚本会提示失败，按提示手动处理即可

## 目录结构

```
dsh-project-file-explorer/
├── lib/
│   ├── index.js          # host 端：/project-files/list、/project-files/read HTTP 路由
│   │                     #        媒体分类 + data URL + 二进制/超大文件检测
│   └── client.js         # 浏览器端：详情停靠、文件标签、媒体渲染、自动激活、响应式
├── scripts/
│   ├── install.mjs      # 一键安装（复制 + 注册 + 打补丁，幂等）
│   └── patch-harness.mjs # 幂等补丁脚本（--check / --target 参数）
├── example/
│   └── cordis.patch.yml  # loader patch 配置示例
├── package.json
├── LICENSE               # MIT
└── README.md
```

## 常见问题 (FAQ)

**Q: 右侧面板没出现？**
先确认补丁已应用（`npm run check` 全部显示"已存在"），然后完全重启 `dsh web`（停掉进程再启动，热重载可能不生效）。

**Q: 插件报 `pending (waiting for services: ...)`？**
这是 inject 写错导致的。插件注入的必须是 **cordis 服务名**（`slots` / `workspaces` / `layout`），绝不能写 npm 包名（如 `@deepseek-ai/dsh-client-runtime`）。

**Q: 升级 dsh 后补丁失败 / 提示找不到代码段？**
dsh 版本升级改变了源码。补丁脚本会明确提示哪一处失败，请对照该版本的打包产物手动调整补丁定义（`scripts/patch-harness.mjs` 中的 find / replace 片段），或提 issue。

**Q: 图片显示乱码 / 不显示？**
确认 `lib/index.js` 是最新版（支持 media data URL 渲染）。老版本只返回 base64 文本会被当作文本预览。

**Q: 预览标签点击不自动激活？**
插件通过 DOM 模拟点击最后一个 `role="tab"` 实现自动激活。若失效，请确认浏览器端插件是当前版本且未被覆盖。

**Q: 怎么卸载？**
1. 从 `cordis.patch.yml` 删除 insert 条目
2. 删除 `~/.dsh/profiles/node_modules/@local/dsh-project-file-explorer/`
3. （可选）用 git 还原被补丁的两个 `lib/client.js`（`npm i -g @deepseek-ai/dsh` 重装或重新解压对应包）

## 作者

- **亿哲学长**（GitHub: [BillionSeniors](https://github.com/BillionSeniors)）
- 本插件为原创作品，版权所有。未经作者书面许可，禁止任何形式的转载、盗用或二次发布。
- 如需商用 / 合作 / 授权，请通过 GitHub 联系作者。

## License

[MIT](LICENSE)
