# DeepSeek Harness 插件合集（by 亿哲学长）

> 🔒 **隐私声明：本仓库不含任何 API Key。** 视觉后端 Key 一律通过界面「API Key 直填」粘贴配置（v1.3.0+），只保存在本机 `data/settings.yaml`，不会写入插件、不会随仓库分发、不记录日志。上传前请再次确认没有把密钥写进任何文件。

本仓库包含两个可在 DeepSeek Harness（dsh）上使用的插件：

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
  - 切换方式：插件设置卡片「HTTP 提供方」或「设置 → 模型」页直连提供方，改完保存即生效；界面会自动显示当前用的是哪个 AI（如「DeepSeek + 自动识图（智谱 glm-4v-flash）」）
- **亿哲学长改了什么**：见 [`dsh-vision-router/README.md`](dsh-vision-router/README.md) —— 核心是**在界面显示当前识图 AI 的名称**、修正设置页注册时机、**v1.3.0 新增「API Key 直填」**（设置卡片与模型页直接粘贴 Key 保存，无需环境变量 / YAML）、更新身份信息；**未改动原作者任何识图逻辑**，MIT 许可与原版权声明完整保留。

## 🚀 安装

```bash
# ① 文件浏览器（亿哲学长原创）
dsh plugin add github:BillionSeniors/dsh-plugins/dsh-project-file-explorer

# ② 图片识别（ysr666 原创，亿哲学长定制版）
dsh plugin add github:BillionSeniors/dsh-plugins/dsh-vision-router
```

装完后重启 `dsh web`：粘贴图片 → 聊天模型选择器选带「自动识图」的组 → 发送即可。

> 🧩 **模型页企业级编辑器（核心补丁，可选）**：vision-router 附带 `scripts/patch-harness.mjs`，把「设置 → 模型 → 视觉路由 → 编辑」升级为分组卡片式企业界面（直连提供方 / 服务商预设 / API Key 直填）。安装后执行：
>
> ```sh
> cd <插件目录>
> node scripts/patch-harness.mjs      # --check 可先检查状态
> ```
>
> 只对发布基线一致（0.1.0-rc.6）的核心打补丁，自动备份原文件，版本不匹配自动跳过。

## 🔑 视觉后端 Key 配置（只在本机，不入库）

v1.3.0 起支持**界面直填 Key**，无需再设置环境变量：

1. 打开 **设置 → 模型**，点「视觉路由（自动识图）」行的**编辑**；
   （或 设置 → 插件 → 插件配置 → 视觉路由（自动识图）卡片）
2. 在「直连提供方 / HTTP 提供方」里选择服务商预设（智谱 / 豆包 / OpenAI / Claude 等），或手动填写；
3. 在 **API Key** 输入框粘贴你的 Key，点**保存**；
4. 行上出现**绿点**表示 Key 已配置，识图即可使用；未配置时显示红点，并自动回退内置免费 OVH 链。

> ⚠️ Key 只保存在你本机的设置文件中；切勿把 Key 值写进本仓库的任何文件。

## 📄 目录结构

```
├── README.md                        # 本文件（总览 + 归属 + 隐私声明）
├── dsh-project-file-explorer/       # 亿哲学长原创：项目文件浏览器
│   ├── lib/                         #   host 端 + 浏览器端
│   ├── scripts/                     #   一键安装 / 补丁脚本
│   ├── example/                     #   cordis.patch.yml 示例
│   └── ...
└── dsh-vision-router/               # ysr666 原创（MIT）+ 亿哲学长定制：图片识别
    ├── index.js                     #   host 端（含"显示当前识图 AI"增强）
    ├── lib/                         #   浏览器端 + 工具
    ├── LICENSE                      #   MIT（原作者版权，不可移除）
    └── ...
```

## ⚖️ 许可

- `dsh-project-file-explorer`：MIT（亿哲学长）
- `dsh-vision-router`：MIT（**原作者 ysr666**，版权声明见其 LICENSE，再发布 / 定制时保留）

