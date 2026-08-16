# DeepSeek Harness 插件合集（by 亿哲学长）

> 🔒 **隐私声明：本仓库不含任何 API Key。** 所有密钥只保存在你**本机**（如 `launcher/启动DeepSeek.bat` 里的环境变量）；仓库内启动脚本中的 Key 均为**占位符**，请自行填写后使用。上传前请再次确认没有把密钥写进任何文件。

本仓库包含两个可在 DeepSeek Harness（dsh）上使用的插件，以及一套启动 / 停止脚本：

## 📁 插件列表

| 插件 | 作用 | 作者归属 |
| --- | --- | --- |
| `dsh-project-file-explorer` | 项目文件浏览器：屏幕右缘文件树 + 主区预览标签（代码/图片/PDF） | **亿哲学长（BillionSeniors）原创** |
| `dsh-vision-router` | **图片识别**：粘贴图片自动识图（描述 / OCR / 定位 / 裁剪 / 取色等） | **原作者 ysr666 原创（MIT 协议），亿哲学长再发布 / 定制** |

## 🖼️ 图片识别是哪个？用谁的 AI？

- **识别功能是谁的**：图片识别由 `dsh-vision-router` 提供 —— 这是原作者 **[ysr666](https://github.com/ysr666)** 的原创作品（[原仓库](https://github.com/ysr666/dsh-vision-router)，MIT 协议）。包括 `vision_describe` / `vision_ocr` / `vision_ground` / `vision_crop` 等全套像素级视觉工具、内置免费 OVH 兜底链、图片轮自动路由。
- **"看图"的 AI 是哪家**：插件把图片交给**你配置的视觉模型**识别（支持任意 OpenAI 兼容视觉端点）：
  - 默认推荐：**智谱 GLM-4V-Flash**（智谱 AI 提供，免费）
  - 也可用：**豆包**（火山引擎方舟）、**Gemini**（Google）、**OpenAI** 等
  - 切换方式：插件设置（视觉路由 / httpProviders）或 `settings.yaml`，改完重启即生效；界面会自动显示当前用的是哪个 AI（如「DeepSeek + 自动识图（智谱 glm-4v-flash）」）
- **亿哲学长改了什么**：见 [`dsh-vision-router/README.md`](dsh-vision-router/README.md) —— 核心是**在界面显示当前识图 AI 的名称**、修正设置页注册时机、更新身份信息；**未改动原作者任何识图逻辑**，MIT 许可与原版权声明完整保留。

## 🚀 安装

```bash
# ① 文件浏览器（亿哲学长原创）
dsh plugin add github:BillionSeniors/dsh-project-file-explorer

# ② 图片识别（ysr666 原创，亿哲学长定制版）
dsh plugin add github:BillionSeniors/dsh-vision-router
```

装完后重启 `dsh web`：粘贴图片 → 聊天模型选择器选带「自动识图」的组 → 发送即可。

## 🚀 启动 / 停止脚本（`launcher/`）

- `启动DeepSeek.bat`：一键启动 dsh（自动检测端口 3080，已在运行则直接打开浏览器）
- `停止DeepSeek.bat`：停止 dsh 服务
- `启动 DeepSeek Harness.lnk` / `停止 DeepSeek Harness.lnk`：快捷方式示例（指向上面两个脚本，请按本机路径重建）

> ⚠️ `启动DeepSeek.bat` 中的 `ARK_API_KEY` / `ZHIPU_API_KEY` 已替换为**占位符**，请在本机填写你自己的 Key 再使用，切勿把真实 Key 上传。

## 🔑 视觉后端 Key 配置（只在本机，不入库）

以智谱 GLM-4V-Flash 为例：

1. 在启动脚本（`dsh.bat` / `start-web.cmd`）里设置环境变量：
   ```bat
   set "ZHIPU_API_KEY=你的智谱Key"
   ```
2. 插件配置 `httpProviders`（`data/settings.yaml` 或插件设置页）：
   ```yaml
   vision-router:
     httpProviders:
       - name: zhipu-glm4v
         baseURL: https://open.bigmodel.cn/api/paas/v4
         model: glm-4v-flash
         apiKeyEnv: ZHIPU_API_KEY   # 只填环境变量名，不填 Key 值
         maxTokens: 4096
   ```
3. 重启 `dsh web`，模型选择器会显示：`DeepSeek + 自动识图（智谱 glm-4v-flash）`

> ⚠️ 切勿把 Key 值写进本仓库的任何文件。

## 📄 目录结构

```
├── README.md                        # 本文件（总览 + 归属 + 隐私声明）
├── dsh-project-file-explorer/       # 亿哲学长原创：项目文件浏览器
│   ├── lib/                         #   host 端 + 浏览器端
│   ├── scripts/                     #   一键安装 / 补丁脚本
│   ├── example/                     #   cordis.patch.yml 示例
│   └── ...
├── dsh-vision-router/               # ysr666 原创（MIT）+ 亿哲学长定制：图片识别
│   ├── index.js                     #   host 端（含"显示当前识图 AI"增强）
│   ├── lib/                         #   浏览器端 + 工具
│   ├── LICENSE                      #   MIT（原作者版权，不可移除）
│   └── ...
└── launcher/                        # 启动 / 停止脚本（Key 为占位符，自行填写）
    ├── 启动DeepSeek.bat
    ├── 停止DeepSeek.bat
    ├── 启动 DeepSeek Harness.lnk
    └── 停止 DeepSeek Harness.lnk
```

## ⚖️ 许可

- `dsh-project-file-explorer`：MIT（亿哲学长）
- `dsh-vision-router`：MIT（**原作者 ysr666**，版权声明见其 LICENSE，再发布 / 定制时保留）
