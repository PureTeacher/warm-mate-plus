# -*- coding: utf-8 -*-
"""
暖愈心伴 · 用户数据管理平台 —— 数据库层 (SQLite)

单文件 SQLite，无需外部数据库服务；WAL 模式支持并发读。
表：
  admins     管理员/医生账号（role: admin | doctor）
  users      App 用户账号（手机号 + 密码哈希）
  events     用户使用事件（app_open/login/chat_message/scale_complete/book_create/article_read…）
  messages   医生/管理员下发的建议（App 消息中心读取）
  tokens     用户端与管理端的登录令牌（随机 hex，带过期时间）
"""
import os
import json
import time
import sqlite3
import hashlib
import secrets
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("WARMMATE_DB", os.path.join(BASE, "data", "warmmate.db"))

TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 天


def now_iso():
    """UTC ISO 时间字符串。"""
    return datetime.now(timezone.utc).isoformat()


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ---------------------------------------------------------------------------
# 密码哈希（stdlib 实现，避免引入额外依赖）
# ---------------------------------------------------------------------------
def hash_password(password: str):
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return salt + "$" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, expected = stored.split("$", 1)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return secrets.compare_digest(dk.hex(), expected)


SCHEMA = """
CREATE TABLE IF NOT EXISTS admins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'doctor',   -- admin | doctor
    password     TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone        TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    password     TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT,
    device       TEXT,
    app_version  TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone        TEXT NOT NULL,
    type         TEXT NOT NULL,
    detail       TEXT,                              -- JSON 字符串
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_phone ON events(phone);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone        TEXT NOT NULL,
    sender_id    INTEGER,
    sender_name  TEXT NOT NULL,
    sender_role  TEXT NOT NULL,                    -- admin | doctor
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    read         INTEGER NOT NULL DEFAULT 0,       -- 0 未读 / 1 已读
    read_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);

CREATE TABLE IF NOT EXISTS tokens (
    token        TEXT PRIMARY KEY,
    scope        TEXT NOT NULL,                    -- user | admin
    subject      TEXT NOT NULL,                    -- phone 或 admin username
    expires_at   TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
"""


def init_db():
    conn = _connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        _seed_admins(conn)
        _seed_demo(conn)
    finally:
        conn.close()


def _seed_admins(conn):
    """可选的初始管理员/医生账号（首次建库时写入）。"""
    if conn.execute("SELECT COUNT(*) c FROM admins").fetchone()["c"] > 0:
        return
    now = now_iso()
    seeds = [
        ("admin", "平台管理员", "admin", "admin123"),
        ("doctor", "王医生", "doctor", "doctor123"),
    ]
    for username, display_name, role, pwd in seeds:
        conn.execute(
            "INSERT OR IGNORE INTO admins(username, display_name, role, password, created_at) VALUES(?,?,?,?,?)",
            (username, display_name, role, hash_password(pwd), now),
        )
    conn.commit()


def _seed_demo(conn):
    """示例用户与使用事件，方便后台首次打开即有数据可看（标注为演示数据）。"""
    if conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] > 0:
        return
    now = now_iso()
    demo = [
        ("13800138000", "暖友 8000", "演示·小林"),
        ("13912345678", "暖友 5678", "演示·阿哲"),
        ("13787654321", "暖友 4321", "演示·小满"),
    ]
    for phone, name, _ in demo:
        conn.execute(
            "INSERT OR IGNORE INTO users(phone, name, password, created_at, last_seen_at, device, app_version) "
            "VALUES(?,?,?,?,?,?,?)",
            (phone, name, hash_password("123456"), now, now, "demo-web", "1.1.2"),
        )
    for phone, name, _ in demo:
        events = [
            ("app_open", "打开应用", now),
            ("login", "登录", now),
            ("chat_message", "向小暖倾诉情绪", now),
            ("scale_complete", "完成 PHQ-9 测评", now),
            ("book_create", "提交咨询预约", now),
            ("article_read", "阅读健康科普", now),
        ]
        for typ, d, t in events:
            conn.execute(
                "INSERT INTO events(phone, type, detail, created_at) VALUES(?,?,?,?)",
                (phone, typ, json.dumps({"desc": d}, ensure_ascii=False), t),
            )
    # 给演示用户留几条建议，展示“消息中心”
    msgs = [
        ("13800138000", "demo", "暖愈心伴 · 小暖", "doctor",
         "你好呀，看到你最近完成了测评，记得结果只是自我了解参考。如果连续一周情绪低落、睡眠变差，建议预约校内心理中心聊聊。需要时我一直在这里。🌿"),
        ("13912345678", "demo", "暖愈心伴 · 小暖", "doctor",
         "注意到你最近常来陪伴。给自己留一点放空的时间，哪怕每天 10 分钟深呼吸，也会舒服一些。"),
    ]
    for phone, sender_id, sender_name, sender_role, content in msgs:
        conn.execute(
            "INSERT INTO messages(phone, sender_id, sender_name, sender_role, content, created_at, read) "
            "VALUES(?,?,?,?,?,?,0)",
            (phone, sender_id, sender_name, sender_role, content, now),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# 令牌
# ---------------------------------------------------------------------------
def create_token(scope: str, subject: str) -> str:
    token = secrets.token_hex(32)
    now = datetime.now(timezone.utc)
    expires = now.replace(second=0, microsecond=0)
    from datetime import timedelta
    expires = now + timedelta(seconds=TOKEN_TTL_SECONDS)
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO tokens(token, scope, subject, expires_at, created_at) VALUES(?,?,?,?,?)",
            (token, scope, subject, expires.isoformat(), now_iso()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def resolve_token(token: str):
    """返回 dict(scope, subject, phone等) 或 None。过期或不存在返回 None。"""
    if not token:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT scope, subject, expires_at FROM tokens WHERE token=?", (token,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    exp = row["expires_at"]
    try:
        # ISO 带时区比较：统一转 UTC 时间戳
        exp_ts = datetime.fromisoformat(exp).timestamp()
        if time.time() > exp_ts:
            return None
    except ValueError:
        return None
    return {"scope": row["scope"], "subject": row["subject"]}


def delete_token(token: str):
    conn = _connect()
    try:
        conn.execute("DELETE FROM tokens WHERE token=?", (token,))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 用户
# ---------------------------------------------------------------------------
def get_user(phone: str):
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_user(phone: str, name: str, password: str, device=None, app_version=None):
    conn = _connect()
    try:
        now = now_iso()
        cur = conn.execute(
            "INSERT INTO users(phone, name, password, created_at, last_seen_at, device, app_version) "
            "VALUES(?,?,?,?,?,?,?)",
            (phone, name, hash_password(password), now, now, device, app_version),
        )
        conn.commit()
        return cur.lastrowid
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ValueError("phone_exists")
    finally:
        conn.close()


def touch_user(phone: str, device=None, app_version=None):
    conn = _connect()
    try:
        conn.execute("UPDATE users SET last_seen_at=?, device=COALESCE(?,device), app_version=COALESCE(?,app_version) "
                     "WHERE phone=?", (now_iso(), device, app_version, phone))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 事件
# ---------------------------------------------------------------------------
def add_event(phone: str, type_: str, detail: dict = None):
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO events(phone, type, detail, created_at) VALUES(?,?,?,?)",
            (phone, type_, json.dumps(detail or {}, ensure_ascii=False), now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def events_after(after_id: int, limit: int = 200):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?", (after_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def recent_events(limit: int = 200):
    """倒序取最近事件（实时看板兜底 / 首次加载）。"""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        out = [dict(r) for r in rows]
        out.reverse()
        return out
    finally:
        conn.close()


def user_events(phone: str, limit: int = 200):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM events WHERE phone=? ORDER BY id DESC LIMIT ?", (phone, limit)
        ).fetchall()
        out = [dict(r) for r in rows]
        out.reverse()
        return out
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 消息
# ---------------------------------------------------------------------------
def send_message(phone: str, sender_id, sender_name: str, sender_role: str, content: str):
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO messages(phone, sender_id, sender_name, sender_role, content, created_at, read) "
            "VALUES(?,?,?,?,?,?,0)",
            (phone, sender_id, sender_name, sender_role, content, now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def user_messages(phone: str):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM messages WHERE phone=? ORDER BY id DESC", (phone,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def unread_count(phone: str):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) c FROM messages WHERE phone=? AND read=0", (phone,)
        ).fetchone()
        return int(row["c"])
    finally:
        conn.close()


def mark_read(phone: str, msg_id: int):
    conn = _connect()
    try:
        conn.execute(
            "UPDATE messages SET read=1, read_at=? WHERE id=? AND phone=?",
            (now_iso(), msg_id, phone),
        )
        conn.commit()
    finally:
        conn.close()


def admin_messages(limit: int = 200):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM messages ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 管理端
# ---------------------------------------------------------------------------
def get_admin(username: str):
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM admins WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_users():
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT phone, name, created_at, last_seen_at, device, app_version FROM users ORDER BY id ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def usage_stats(phone: str):
    """单个用户的聚合指标。"""
    conn = _connect()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM events WHERE phone=?", (phone,)).fetchone()["c"]
        by_type = conn.execute(
            "SELECT type, COUNT(*) c FROM events WHERE phone=? GROUP BY type", (phone,)
        ).fetchall()
        chat = conn.execute(
            "SELECT COUNT(*) c FROM events WHERE phone=? AND type='chat_message'", (phone,)
        ).fetchone()["c"]
        scale = conn.execute(
            "SELECT COUNT(*) c FROM events WHERE phone=? AND type='scale_complete'", (phone,)
        ).fetchone()["c"]
        book = conn.execute(
            "SELECT COUNT(*) c FROM events WHERE phone=? AND type='book_create'", (phone,)
        ).fetchone()["c"]
        unread = conn.execute(
            "SELECT COUNT(*) c FROM messages WHERE phone=? AND read=0", (phone,)
        ).fetchone()["c"]
        last_event = conn.execute(
            "SELECT type, created_at FROM events WHERE phone=? ORDER BY id DESC LIMIT 1", (phone,)
        ).fetchone()
        return {
            "events": int(total),
            "chat_messages": int(chat),
            "scales": int(scale),
            "bookings": int(book),
            "unread_msgs": int(unread),
            "by_type": {r["type"]: int(r["c"]) for r in by_type},
            "last_event": (dict(last_event) if last_event else None),
        }
    finally:
        conn.close()


def active_today():
    """今日活跃（按 UTC 当日 0 点起）。简化为跨最近 24 小时去重手机号。"""
    conn = _connect()
    try:
        # 取最近 24 小时有事件或最近登录过的用户
        rows = conn.execute(
            "SELECT DISTINCT phone FROM events WHERE created_at >= datetime('now','-1 day')"
        ).fetchall()
        return [r["phone"] for r in rows]
    finally:
        conn.close()
