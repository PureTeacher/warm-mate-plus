# 暖愈心伴（Warm Mate）

<p align="center">
  <img src="logo2.png" alt="暖愈心伴 Logo" width="160" />
</p>

<p align="center">
  面向高校青年群体的 AI 心理健康支持与专业转介服务原型
</p>

> 当前版本：`v1.1.2`　｜　状态：功能原型　｜　平台：Web / Android

## 项目简介

暖愈心伴尝试把心理健康科普、自我筛查、AI 情绪陪伴和专业资源转介组织成一条连续服务路径：

**预防 → 评估 → 陪伴 → 转介**

项目旨在提供低门槛的心理健康支持入口，帮助用户了解自身状态、梳理情绪并找到现实支持资源。它不是医疗产品，不能进行疾病诊断，也不能替代心理咨询师、医生或紧急救援服务。

## 核心功能

- **AI 暖心对话**：接入 DeepSeek `deepseek-chat`，支持上下文对话、网络异常降级和模型前确定性危机安全门。
- **心理自我筛查**：原型包含 PHQ-9、GAD-7、CPSS、UCLA 四类演示量表及确定性计分流程。
- **心理健康科普**：提供分类浏览、关键词搜索、文章详情和收藏功能。
- **预约流程演示**：展示6类校内外资源入口和预约表单流程；当前资源卡片均为流程示例，不代表已签约资源。
- **数据持久化**：登录/注册、聊天、测评、预约等行为会上报到后端并落库，后台可实时查看。
- **个人中心**：展示对话、测评、预约和收藏等记录入口。
- **Android 应用**：通过 Capacitor 封装 H5，并提供可安装的 APK 构建产物。

## 用户数据管理平台（user-admin）

面向医生/管理员的 **Web 数据后台**（`user-admin/`），进行用户使用监控与关怀建议下发：

- **实时看板**：累计用户/事件、今日活跃、事件分布条形图、**实时事件流**（每 3 秒增量刷新）。
- **用户管理**：用户使用统计列表、单个用户详情与行为流水。
- **使用明细**：按事件类型/手机号筛选的完整行为记录。
- **消息下发**：勾选用户发送建议，写入数据库；用户端在 App「我的消息」中查看并标记已读。

本地运行后访问 `http://127.0.0.1:8080/admin/`（账号 `admin/admin123`；医生 `doctor/doctor123`）。
详见 [user-admin/README.md](user-admin/README.md)。

## 技术架构

```text
Web / Android
  └─ HTML + CSS + JavaScript
       └─ Capacitor Android
            └─ FastAPI REST API
                 └─ DeepSeek API (deepseek-chat)
```

| 层级 | 技术 | 说明 |
|---|---|---|
| Web 原型 | HTML、CSS、JavaScript | 页面、路由、交互和演示数据 |
| Android | Capacitor 8、Gradle | H5 跨端封装与安装包构建 |
| 后端 | Python、FastAPI、httpx | 健康检查、对话接口和静态文件托管 |
| AI 服务 | DeepSeek API | 由服务端环境变量注入密钥 |

## 仓库结构

```text
warm-mate-plus/
├─ app/                 # Capacitor Android 工程
│  ├─ www/              # App 使用的 Web 资源
│  ├─ android/          # Android 原生工程
│  └─ assets/           # 图标源文件
├─ backend/             # FastAPI 后端
│  ├─ main.py
│  ├─ db.py             # SQLite 数据层（用户/事件/消息/管理员）
│  └─ requirements.txt
├─ user-admin/          # 用户数据管理平台（后台前端 + 说明）
├─ prototype/           # 可直接运行的 Web 原型
├─ dist/                # APK 构建产物
├─ 使用文档.md           # 完整功能与部署说明
└─ WORKBENCH.md         # 项目工作台说明
```

计划书、研究笔记和 Word 文档单独保存在本地归档目录，不纳入本仓库。

## 快速开始

### 1. 运行 Web 原型

可以直接打开 `prototype/index.html`，也可以启动本地静态文件服务器：

```bash
cd prototype
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

### 2. 启动 FastAPI 后端

```bash
cd backend
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
uvicorn main:app --host 127.0.0.1 --port 8080
```

macOS / Linux：

```bash
source .venv/bin/activate
pip install -r requirements.txt
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
uvicorn main:app --host 127.0.0.1 --port 8080
```

健康检查：

```text
GET http://127.0.0.1:8080/api/health
```

对话接口：

```text
POST http://127.0.0.1:8080/api/chat
Content-Type: application/json

{
  "message": "最近压力很大",
  "history": []
}
```

不要把 API Key 写入前端、源码、提交记录或截图。

### 3. 安装与同步 Android 工程

需要预先安装 Node.js、Android Studio 和兼容的 JDK：

```bash
cd app
npm ci
npm run sync
npm run android
```

`npm run android` 会在 Android Studio 中打开原生工程，之后可选择设备进行调试或构建 APK。

## APK 构建产物

仓库包含以下演示安装包：

- [WarmMate-v1.1.2.apk](dist/WarmMate-v1.1.2.apk)
- [WarmMate-v1.1.2-debug.apk](dist/WarmMate-v1.1.2-debug.apk)

安装前请确认 APK 来源可信，并根据 Android 系统提示决定是否允许安装未知来源应用。

## 测试

离线回复匹配逻辑使用 Node.js 内置测试运行器：

```bash
node app/www/js/reply.test.js
```

后端基础语法检查：

```bash
python -m py_compile backend/main.py
```

当前测试只覆盖离线回复匹配和基础语法，不代表 AI 回复质量、危机识别、量表授权或临床安全已经得到验证。

## 当前限制

- 登录、记录和预约数据主要为前端原型状态，尚未形成完整的服务端账户与持久化体系。
- 咨询师姓名、评分和服务次数属于界面演示数据，正式运营前必须逐一核验资质并取得授权。
- 心理量表上线前仍需核验中文版本、计分规则、适用人群和使用授权。
- AI 对话不能自动诊断疾病，也不能独立承担自伤、自杀等高风险事件的判断和处置。
- 正式试点前仍需完成隐私影响评估、安全测试、专业评审和人工危机流程演练。

## 安全与隐私

- 仅收集实现功能所必需的数据，并提供清晰的授权、撤回和删除机制。
- 敏感数据不得写入客户端日志或公开仓库。
- 高风险表达先由确定性安全门拦截，停止普通聊天并提示110/120、可信任者及当地已核验资源；该机制仍需专业评审和持续测试。
- 如发现真实且紧迫的危险，请立即联系当地急救、警方或具备资质的专业机构。

## 版本记录

| 版本 | 说明 |
|---|---|
| `v1.0.0` | 建立应用骨架和基础功能 |
| `v1.1.2` | 接入 DeepSeek、完成 Android 打包并修复页面跳转与返回键问题 |

## 更多资料

- [完整使用文档](使用文档.md)
- [GitHub 仓库](https://github.com/PureTeacher/warm-mate-plus)

## 许可说明

本仓库暂未声明开源许可证。未经项目所有者明确授权，不代表允许复制、修改、分发或商业使用。
