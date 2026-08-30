# -*- coding: utf-8 -*-
"""用户数据管理平台 API 冒烟测试（本地）。"""
import json
import random
import httpx

BASE = "http://127.0.0.1:8080"
c = httpx.Client(base_url=BASE, timeout=10)
ok = True

# 每次用随机手机号，保证可重复运行
PHONE = "13" + "".join(random.choice("0123456789") for _ in range(9))


def check(label, resp, expect_ok=True, expect_code=None):
    global ok
    tag = "OK" if (resp.status_code < 400) else ("EXPECTED-ERR" if expect_code else "ERR")
    print(f"[{resp.status_code}] {label}: {resp.text[:180]}  ({tag})")
    if expect_ok and resp.status_code >= 400:
        ok = False
    if expect_code and resp.status_code not in expect_code:
        ok = False


# 1. 注册一个新用户
r = c.post("/api/app/register", json={"phone": PHONE, "password": "pass123", "name": "测试用户", "device": "web", "app_version": "1.2.0"})
check("register new user", r)
user_token = (r.json().get("token") if r.status_code == 200 else None)

# 2. 重复注册应 409
r2 = c.post("/api/app/register", json={"phone": PHONE, "password": "pass123"})
check("register duplicate", r2, expect_ok=False, expect_code=[409])

# 3. 登录（错误密码 -> 401）
r3 = c.post("/api/app/login", json={"phone": PHONE, "password": "wrong"})
check("login wrong pwd", r3, expect_ok=False, expect_code=[401])

r4 = c.post("/api/app/login", json={"phone": PHONE, "password": "pass123"})
check("login ok", r4)
user_token = r4.json().get("token")

h_user = {"Authorization": f"Bearer {user_token}"}
# 4. 上报事件
r5 = c.post("/api/app/events", json={"events": [
    {"type": "chat_message", "detail": {"desc": "向小暖倾诉"}},
    {"type": "scale_complete", "detail": {"name": "GAD-7", "score": 9, "level": "轻度"}},
]}
, headers=h_user)
check("report events", r5)

# 5. 读取用户消息（含演示/下发）
r6 = c.get("/api/app/messages", headers=h_user)
check("user messages", r6)

# 6. 无 token 访问应 401
r7 = c.get("/api/app/me")
check("me without token", r7, expect_ok=False, expect_code=[401])
r8 = c.get("/api/app/me", headers=h_user)
check("me with token", r8)

# 7. 管理员登录
r9 = c.post("/api/admin/login", json={"username": "admin", "password": "admin123"})
check("admin login", r9)
admin_token = r9.json().get("token")
h_admin = {"Authorization": f"Bearer {admin_token}"}

r10 = c.get("/api/admin/overview", headers=h_admin)
check("admin overview", r10)

r11 = c.get("/api/admin/users", headers=h_admin)
check("admin users", r11)

r12 = c.get("/api/admin/events", headers=h_admin)
check("admin events", r12)

# 8. 下发建议给测试用户
r13 = c.post("/api/admin/messages", json={"phones": [PHONE], "content": "多休息，照顾好自己哟 🌿"}, headers=h_admin)
check("send message", r13)

# 9. 用户读取新消息并标记已读
r14 = c.get("/api/app/messages", headers=h_user)
check("user messages after send", r14)
mid = None
for m in r14.json().get("messages", []):
    if m.get("content") == "多休息，照顾好自己哟 🌿":
        mid = m["id"]
if mid:
    c.post(f"/api/app/messages/{mid}/read", headers=h_user)
r15 = c.get("/api/app/messages", headers=h_user)
check("messages after read", r15)

# 10. 管理员查看发送记录
r16 = c.get("/api/admin/messages", headers=h_admin)
check("admin messages list", r16)

# 11. 访问根路径（应为 App 前端 HTML）与后台不存在时
r17 = c.get("/")
check("root serves app html", r17)

# 12. 实时增量事件流：先取当前 max id，再让用户上报一条，后台应按 after_id 拉到
last_id = r12.json()["last_id"] if "last_id" in r12.json() else 0
c.post("/api/app/events", json={"events": [{"type": "article_read", "detail": {"title": "压力管理"}}]}, headers=h_user)
r18 = c.get(f"/api/admin/events?after_id={last_id}", headers=h_admin)
new_evs = r18.json().get("events", [])
has_new = any(e.get("type") == "article_read" for e in new_evs)
print(f"[{r18.status_code}] realtime feed: got {len(new_evs)} new after id {last_id}; sees article_read={has_new}")
if not has_new:
    ok = False

print("\nSMOKE RESULT:", "PASS" if ok else "FAIL")
