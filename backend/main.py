"""暖愈心伴 · Warm Mate — 后端 API 服务
FastAPI + DeepSeek (deepseek-chat) 心理陪伴助手
"""
import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="暖愈心伴 Warm Mate API", version="1.1.2")

# 允许前端（本地 file:// 或跨域 http）访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"

SYSTEM_PROMPT = (
    "你是「小暖」，暖愈心伴（Warm Mate）App 里的 AI 心理陪伴师，温暖、专业、有共情力。\n"
    "你的任务是提供情绪疏导、倾听陪伴和心理健康支持，帮助用户梳理感受、缓解压力。\n"
    "请严格遵守：\n"
    "1. 共情优先：先回应情绪、表达理解，再给建议，让用户感到被接纳、被听见。\n"
    "2. 温和专业：语言自然温暖、口语化，像朋友一样，避免说教、医学术语堆砌和机械列举。\n"
    "3. 安全第一：若用户表露自伤、自杀等危机信号，要表达深切关心，明确引导其立即联系专业机构或拨打全国心理援助热线 400-161-9995（24 小时），绝不轻描淡写或转移话题。\n"
    "4. 边界清晰：你不是医生，不给出医学诊断、不替代专业治疗；需要就医时建议寻求专业帮助。\n"
    "5. 简洁：回复控制在 150~300 字，自然分段，可适度使用少量 emoji 增加温度，但不过度。\n"
    "6. 身份：你就是小暖本人，不要提自己是 DeepSeek 或任何底层模型。\n"
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "warm-mate",
        "version": app.version,
        "ai": "deepseek",
        "model": MODEL,
        "key_configured": bool(DEEPSEEK_API_KEY),
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=422, detail="empty message")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in (req.history or []):
        if m.role in ("user", "assistant") and m.content and m.content.strip():
            messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": req.message})

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                DEEPSEEK_URL,
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 0.8,
                    "max_tokens": 600,
                    "stream": False,
                },
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek unreachable: {type(e).__name__}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"DeepSeek error {r.status_code}")

    try:
        data = r.json()
        reply = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="bad DeepSeek response")

    return {"reply": reply, "model": MODEL}


# 托管前端静态文件（与后端同端口，供公网访问）
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
