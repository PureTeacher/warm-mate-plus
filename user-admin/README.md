# 暖愈心伴 · 用户数据管理平台（user-admin）

面向「暖愈心伴 Warm Mate」App 的 **用户数据管理后台**：医生/管理员可**实时监控**用户的 App
使用情况，并向用户**下发关怀建议**（用户端在 App「我的消息」中查看）。

- **后端**：Python FastAPI + SQLite（单文件数据库，无外部依赖），并对接 DeepSeek 对话。
- **前端**：原生 HTML/CSS/JS 单页后台（无 CDN、无需联网），用户在 `prototype/`（Web）与
  `app/www/`（Android Capacitor）两端使用。
- **部署**：本地即可跑通；云端可按 `WORKBENCH.md` 的阿里云 ECS + Workbench CLI 流程部署（见文末）。

> 本平台把原有「前端内存态」升级为「真实后端持久化」：注册/登录、聊天、测评、预约、阅读科普等
> 行为都会上报到后端并落库，后台据此实时展示。

---

## 一、功能概览

| 后台页面 | 说明 |
|---|---|
| **实时看板** | 累计用户/事件、今日活跃、使用事件分布（条形图）、最近活跃用户、**实时事件流**（每 3 秒增量刷新） |
| **用户管理** | 用户列表与使用统计（对话/测评/预约/未读建议/最近事件），可搜索、查看单个用户详情与历史建议 |
| **使用明细** | 全部使用行为流水，可按事件类型、手机号筛选 |
| **消息下发** | 勾选一位或多位用户，编辑建议内容后一次下发；可查已下发记录与已读状态 |

用户端 App：
- 登录/注册改为**真实后端账号**（手机号 + 密码，服务端 `pbkdf2` 哈希）。
- 在聊天、测评、预约、阅读科普、收藏等动作发生时**自动上报使用事件**。
- 新增「我的消息」：展示医生/管理员下发的建议，支持标记已读与未读角标。

---

## 二、目录结构

```
warm-mate-plus/
├─ backend/
│  ├─ main.py        # FastAPI 主服务（App API + 管理 API + 静态托管）
│  ├─ db.py          # SQLite 数据层（建库、种子、辅助函数）
│  ├─ safety.py      # 危机安全门
│  └─ data/warmmate.db  # 运行后自动生成的数据库（建议加入 .gitignore）
├─ user-admin/       # 用户数据管理平台（后台）
│  ├─ static/        # 后台前端（login + 看板 + 用户 + 明细 + 消息）
│  ├─ README.md      # 本文档
│  └─ 启动.bat       # Windows 一键启动
├─ prototype/        # Web App 前端（已接入真实上报与消息中心）
└─ app/www/          # Android（Capacitor）用 Web 资源（已同步 + 指向云端后端）
```

> 说明：后台前端由 `backend/main.py` 以 `/admin/` 路径托管，因此**只需要一个后端服务**即可同时提供
> App 前端、App API 与后台界面，便于在云端只开一个端口。

---

## 三、本地运行

### 方式 1：双击启动（Windows，推荐）
双击 `user-admin\启动.bat`。脚本启动后端并自动打开管理后台
[http://127.0.0.1:8080/admin/](http://127.0.0.1:8080/admin/)。

### 方式 2：命令行启动
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8080
```

- 管理后台：`http://127.0.0.1:8080/admin/`
- 用户 App（Web）：`http://127.0.0.1:8080/`
- API 文档：`http://127.0.0.1:8080/docs`

### 登录账号（首次建库自动生成）
| 账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123` | 管理员 |
| `doctor` | `doctor123` | 医生 |

> 后台已有演示用户（13800138000 / 13912345678 / 13787654321，密码 `123456`）与演示事件，
> 方便首次打开即看到数据。也可在 App 端注册新用户后刷新后台查看。

---

## 四、使用流程体验

1. 打开 `http://127.0.0.1:8080/`（App 端），注册或登录一个账号。
2. 在 App 里聊天、做一次测评、预约、打开一篇文章。
3. 打开 `http://127.0.0.1:8080/admin/` 并登录，进入「实时看板」：能看到事件流每 3 秒刷新出刚才的行为。
4. 进入「用户管理」→ 点击某个用户「详情」，查看该用户的使用统计与行为流水。
5. 进入「消息下发」，勾选该用户，写一段建议并发送。
6. 回到 App 端「我的消息」：能看到刚下发的建议与未读角标，点「标记已读」后后台显示已读。

---

## 五、接口说明

### 用户端 `/api/app/*`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/app/register` | 注册（`{phone,password}` → `{token,user}`） |
| POST | `/api/app/login` | 登录（`{phone,password}` → `{token,user}`） |
| GET | `/api/app/me` | 当前用户（需 Bearer token） |
| POST | `/api/app/events` | 上报使用事件（`{events:[{type,detail}]}`） |
| GET | `/api/app/messages` | 我的建议（含未读数） |
| POST | `/api/app/messages/{id}/read` | 标记已读 |

### 管理端 `/api/admin/*`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/login` | 后台登录（`{username,password}` → `{token,admin}`） |
| GET | `/api/admin/overview` | 看板聚合（KPI、事件分布、最近活跃） |
| GET | `/api/admin/users` | 用户列表 + 使用统计 |
| GET | `/api/admin/events?after_id=0` | 事件流（**增量**，`after_id` 传上次最大 id 即实现实时） |
| GET | `/api/admin/users/{phone}` | 单个用户详情（统计 + 行为 + 建议） |
| POST | `/api/admin/messages` | 下发建议 `{phones:[...],content}` |
| GET | `/api/admin/messages` | 已下发建议列表 |

### 事件类型
`app_open`、`register`、`login`、`chat_message`、`scale_complete`、`book_create`、
`article_read`、`article_favorite`、`message_received`。

---

## 六、部署到阿里云 ECS（基于 Workbench CLI）

> 连接信息见仓库根目录 `WORKBENCH.md`（Region `cn-beijing`，实例 `i-2ze94lfaf2170ie53xod`，
> Ubuntu 22.04）。建议使用 Workbench CLI 执行，避免 SSH。

### 6.1 确认目标状态（先只读检查）
```powershell
& 'C:\Program Files\workbench\workbench.exe' list ecs --region cn-beijing --output json
& 'C:\Program Files\workbench\workbench.exe' exec --instance-id i-2ze94lfaf2170ie53xod --command "ls -la /opt/warm-mate" --output json
```

### 6.2 上传代码
```powershell
# 本地打包关键目录后上传（先确认远端目标目录是否存在，避免覆盖）
& 'C:\Program Files\workbench\workbench.exe' upload backend /opt/warm-mate/backend --instance-id i-2ze94lfaf2170ie53xod
& 'C:\Program Files\workbench\workbench.exe' upload user-admin /opt/warm-mate/user-admin --instance-id i-2ze94lfaf2170ie53xod
& 'C:\Program Files\workbench\workbench.exe' upload prototype /opt/warm-mate/prototype --instance-id i-2ze94lfaf2170ie53xod
```
> 覆盖前务必用 `6.1` 的 `ls` 先确认，避免误覆盖已有配置；如远端 `warm-mate.service` 已在运行，
> 升级前先 `systemctl stop warm-mate`。

### 6.3 安装依赖与重启服务
```powershell
& 'C:\Program Files\workbench\workbench.exe' exec --instance-id i-2ze94lfaf2170ie53xod --command "cd /opt/warm-mate/backend && /opt/warm-mate/venv/bin/pip install -r requirements.txt" --output json
& 'C:\Program Files\workbench\workbench.exe' exec --instance-id i-2ze94lfaf2170ie53xod --command "systemctl restart warm-mate && systemctl status warm-mate --no-pager" --output json
```

### 6.4 验证
```powershell
# 健康检查
Invoke-RestMethod -Uri "http://47.93.117.13:8080/api/health"
# 后台可访问
Invoke-WebRequest -Uri "http://47.93.117.13:8080/admin/" -UseBasicParsing | Select-Object StatusCode
```

> **安全提醒**：后台已开启，但 `admin`/`doctor` 初始密码仅用于演示，正式上线前请务必在
> `backend/db.py` 的 `_seed_admins` 中改为强密码，并限制 `/admin` 访问来源（如安全组仅放行特定 IP，
> 或加一层反向代理鉴权）。用户数据涉及隐私，正式运营前请完成隐私影响评估、传输/存储加密与留存策略。

---

## 七、声明

- 本平台用于「暖愈心伴」App 的用户使用监控与关怀建议下发。
- 测评结果、AI 对话均为心理支持，**不构成医学诊断或治疗建议**；存在立即危险时请直接联系
  110/120、身边可信任的人或当地经核验的专业机构。
- 演示数据（用户/事件/消息）仅用于界面展示，请勿在正式环境使用初始弱口令。
