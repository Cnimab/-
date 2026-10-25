<h1 align="center">🔥 Douyin Auto Spark</h1>

<p align="center">
  <strong>抖音聊天续火脚本 · Playwright 自动化 · GitHub Actions 定时运行</strong>
</p>

<div align="center">
  <img src="assets/readme/logo.png" alt="Douyin Auto Spark Logo" width="120">
</div>
<br>

<div align="center">
  <a href="https://github.com/bling-yshs/douyin-auto-spark/stargazers"><img src="https://img.shields.io/github/stars/bling-yshs/douyin-auto-spark?logo=github&color=yellow" alt="Stars"></a>
  <a href="https://github.com/bling-yshs/douyin-auto-spark/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-orange" alt="License"></a>
</div>
<br>

## 🛑 恢复前的安全诊断（当前为待实机验证的修复）

**这份改动不是“已恢复发送”的证明。暂时不要启用旧版工作流或直接重跑旧任务。**
修复默认只诊断，不发消息；原好友 Secret、随机一言文件和原定时表达式保持不变。

1. 先审阅并合入安全修复，再由仓库所有者处理工作流启用。只推送修复分支不会替换 `main`。
2. 在 `🚀 续一次火` 的 `Run workflow` 中选择 `diagnose`（默认）。它只检查原名单首位好友是否有唯一搜索结果、聊天框是否可用；不输入或发送消息。
3. 诊断日志只输出固定状态码。若出现 `LOGIN_REQUIRED_REFRESH_COOKIE_PRIVATELY`，请在自己设备登录抖音后，**自行在仓库 Secrets 更新 Cookie**；不要贴到聊天、Issue 或日志里。若出现 `ACCESS_CHALLENGE_STOP_MANUAL_REVIEW`，停止自动化，手动检查；不绕过验证码或风控。
4. `CHAT_SEARCH_UNAVAILABLE` 仅说明聊天搜索不可用，不能据此断言 Cookie 已过期。需要在已登录界面检查是否为页面改版、登录失败或服务异常。
5. **尚缺实机校验：**维护者必须在当前已登录聊天页核对会话标题和“自己发出的消息正文”定位规则。当前环境没有该界面，不能猜测规则。`DOUYIN_CHAT_HEADER_SELECTOR` 与 `DOUYIN_OUTGOING_MESSAGE_SELECTOR` 未配置时，所有发送模式都会在输入前停止。这是维护者适配项，**不要求普通用户自己编写 CSS**。
6. 适配完成且诊断通过后，才选择 `test-one`：只给原名单第一位好友发送一条原一言；在全新浏览器上下文重新打开同一聊天并确认该条发出记录存在，才报告 `PERSISTED_OUTGOING_RECORD_VERIFIED_RECIPIENT_1`。这证明聊天记录持久化，不代表对方已读或火花一定增加。
7. 若出现 `SEND_OUTCOME_UNCERTAIN_STOP_CHECK_CHAT_DO_NOT_RETRY`，可能已经发出，先手动查聊天，**不要重跑**；本次会停止后续好友发送。工作流也拒绝直接重跑发送任务，避免重复消息。

当前没有完成真实登录诊断和单条试发，因此定时恢复仍待确认。`diagnose` 成功只代表检查通过，不代表发送成功。诊断不上传截图、页面正文、网络记录或 Cookie；CI 测试使用拦截所有请求的虚拟聊天页，不使用任何仓库 Secret。

维护者本地验证：`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`。
测试需要 Playwright Chromium；可用 `TEST_BROWSER_PATH` 指向本机 Chromium。
本地 `pnpm dev` 也默认 `RUN_MODE=diagnose`。恢复后的定时任务使用原时间和名单；可选邮件的三项 Secret 不齐全时自动跳过邮件步骤。

## ✨ 项目简介

本项目是一个基于 **Playwright + TypeScript** 的抖音聊天自动化脚本。它会携带你配置的抖音 Cookie 打开聊天页，按配置的会话名称依次定位聊天对象，并从 `assets/yiyan.json` 中随机挑选一句 `hitokoto` 发送出去。

适合放到 GitHub Actions 中定时运行，也可以在本地用 `pnpm dev` 手动执行。

## 🚀 功能特性

- 🎭 **Cookie 登录** - 通过 `DOUYIN_COOKIE` 注入抖音登录态，无需脚本内输入账号密码
- 🎯 **多会话发送** - 通过 `DOUYIN_TARGET_NAMES` 配置多个聊天对象
- 💬 **随机一言** - 每次从 `assets/yiyan.json` 随机挑选一条 `hitokoto` 作为消息内容
- 🤖 **定时续火** - 通过 Github Action 每天 0 点自动续火（但是 Github 定时任务要排队，可能会延迟几个小时）

## 🧰 准备工作

在配置 GitHub Actions 或本地 `.env` 之前，需要先准备抖音 Cookie 和要发送消息的会话名称。

### 1️⃣ 获取抖音 Cookie

1. 使用 Chrome 打开 [Cookie-Editor 插件页面](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)，安装 Cookie-Editor。

2. 打开 [抖音聊天页](https://www.douyin.com/chat)，并登录你的抖音账号。

3. 登录成功后，点击浏览器右上角的 Cookie-Editor 插件图标。

4. 点击 `Export`，选择 `JSON`，复制导出的完整数组内容。

   ![cookie](assets/readme/cookie.png)

导出的内容大概长这样：

```json
[
  {
    "domain": ".douyin.com",
    "expirationDate": 1800175766.87008,
    "hostOnly": false,
    "httpOnly": false,
    "name": "UIFID",
    "path": "/",
    "sameSite": "no_restriction",
    "secure": true,
    "session": false,
    "storeId": null,
    "value": "替换成真实 Cookie 值"
  }
]
```

后面配置 `DOUYIN_COOKIE` 时，需要把整个 JSON 数组作为一行字符串填进去。

## 运行方式
### ⚙️ GitHub Actions

推荐直接使用 GitHub Actions 定时运行

#### 1️⃣ Fork 项目

点击 GitHub 页面右上角的 `Fork`（同时希望可以 star ⭐一下本项目），把本项目复制到你自己的 GitHub 账号下。

![fork](assets/readme/fork.jpg)

Fork 后进入你自己的仓库，例如：

```text
https://github.com/你的用户名/douyin-auto-spark
```

#### 2️⃣ 配置 Secrets

进入你 Fork 后的仓库：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

![add-secret](assets/readme/add-secret.jpg)

添加以下 secrets：

| Secret | 必填 | 说明 |
|:---|:---:|:---|
| `DOUYIN_COOKIE` | ✅ | 抖音 Cookie JSON 字符串数组 （上面用浏览器插件获取的那个） |
| `DOUYIN_TARGET_NAMES` | ✅ | 需要续火的朋友的用户名称， JSON 字符串数组，例如 ["暮邵落白"] （不会写 JSON 可以问 AI） |
| `MAIL_ADDRESS` | ❌ | 任务失败提醒的收件邮箱，同时作为邮件发件人地址 |
| `MAIL_USERNAME` | ❌ | QQ 邮箱 SMTP 登录账号，通常与 `MAIL_ADDRESS` 相同 |
| `MAIL_PASSWORD` | ❌ | QQ 邮箱 SMTP 授权码 |

配置 `MAIL_ADDRESS`、`MAIL_USERNAME` 和 `MAIL_PASSWORD` 后，续火失败会向 `MAIL_ADDRESS` 发送提醒邮件。

#### 3️⃣ 手动运行一次

```text
Actions -> 点击绿色的 I understand my workflows, go ahead and enable them -> 🚀 续一次火 -> Enable workflow -> Run workflow
```

修复版首次运行请使用默认 `diagnose`，它不会发送消息。试发及恢复步骤见本文顶部安全诊断说明。

![run-workflow](assets/readme/run-workflow.jpg)

### 💻 本地运行

#### 1️⃣ 安装依赖

本地调试需要 Node.js 和 pnpm

```bash
pnpm install
```

#### 2️⃣ 配置环境变量

复制 `.env.example` 为 `.env`，并按实际情况修改：

```bash
cp .env.example .env
```

核心配置如下：

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---:|:---|
| `DOUYIN_COOKIE` | ✅ | - | 抖音 Cookie JSON 字符串数组 |
| `DOUYIN_TARGET_NAMES` | ✅ | - | 要发送消息的会话名称 JSON 字符串数组 |
| `PLAYWRIGHT_BROWSER_PATH` | ❌ | - | 本机 Chrome / Chromium / Edge 可执行文件路径，不填则使用 Playwright 默认浏览器 |
| `PLAYWRIGHT_HEADLESS` | ❌ | `true` | 是否使用无头模式 |
| `AUTO_CLOSE` | ❌ | `true` | 发送完成后是否自动关闭浏览器 |

`DOUYIN_TARGET_NAMES` 示例：

```dotenv
DOUYIN_TARGET_NAMES='["暮邵落白"]'
```

`DOUYIN_COOKIE` 使用准备工作中导出的 Cookie JSON 数组：

```dotenv
DOUYIN_COOKIE='[{"domain":".douyin.com","expirationDate":1800175766.87008,"hostOnly":false,"httpOnly":false,"name":"UIFID","path":"/","sameSite":"no_restriction","secure":true,"session":false,"storeId":null,"value":"替换成真实 Cookie 值"}]'
```

#### 3️⃣ 启动项目

```bash
pnpm dev
```

脚本默认打开聊天页并检查原名单首位好友，不发送消息。发送仅在完成顶部所述实机适配后，通过明确的 `RUN_MODE=test-one` 或定时模式进行。

## 🔨 开发命令

```bash
# 启动脚本
pnpm dev

# TypeScript 类型检查
pnpm typecheck

# 代码格式化
pnpm format
```

## 📂 项目结构

```text
douyin-auto-spark/
├── .github/workflows/
│   └── renew-fire.yml          # 🚀 GitHub Actions 定时续火任务
├── assets/
│   ├── readme/                 # 🖼️ README 资源
│   └── yiyan.json              # 📚 随机消息数据源
├── src/
│   ├── main.ts                 # 🎭 Playwright 自动化入口
│   └── types/
│       ├── douyin-cookie.ts    # 🍪 抖音 Cookie 类型
│       └── yiyan.ts            # 💬 一言数据类型
├── .env.example                # ⚙️ 环境变量示例
├── .gitignore                  # 🙈 Git 忽略规则
├── .oxfmtrc.jsonc              # 🎨 oxfmt 配置
├── .oxlintrc.jsonc             # 🔍 oxlint 配置
├── LICENSE                     # 📄 GPL v3.0 许可证
├── pnpm-lock.yaml              # 🔒 pnpm 依赖锁文件
├── tsconfig.json               # 🧩 TypeScript 配置
└── package.json                # 📦 项目依赖与脚本
```

## 🛠️ 本地环境

| 环境 | 版本要求 |
|:---:|:---:|
| Node.js | 20 或更新的 LTS 版本 |
| pnpm | 10.33.4 |

## 🔗 主要依赖

| 依赖 | 用途 |
|:---|:---|
| `playwright` | 自动打开浏览器、注入 Cookie、定位会话并发送消息 |
| `dotenv` | 读取本地 `.env` 配置 |
| `tsx` | 本地通过 `pnpm dev` 运行 TypeScript 脚本 |
| `typescript` | 执行 `pnpm typecheck` 类型检查 |
| `oxlint` / `oxfmt` | 代码检查与格式化 |

## 📄 许可证

本项目采用 [GPL v3.0](LICENSE) 开源许可证。

