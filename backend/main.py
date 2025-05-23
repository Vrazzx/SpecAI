import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1"
API_KEY = os.getenv("GIGACHAT_API_KEY")

class ChatRequest(BaseModel):
    message: str
    context: list = []

async def get_access_token():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GIGACHAT_API_URL}/oauth",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Auth failed")
        return response.json()["access_token"]

@app.post("/api/analyze")
async def analyze_documentation(file: UploadFile = File(...)):
    try:
        content = await file.read()
        token = await get_access_token()
        
        prompt = f"Проанализируй этот документ ({file.filename}):\n{content[:5000]}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GIGACHAT_API_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "GigaChat",
                    "messages": [
                        {
                            "role": "system",
                            "content": "Ты анализируешь техническую документацию"
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Analysis failed")
            
            return response.json()
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_assistant(request: ChatRequest):
    try:
        token = await get_access_token()
        
        messages = [
            {
                "role": "system",
                "content": "Ты помогаешь разработчику с техническими вопросами"
            },
            *request.context,
            {
                "role": "user",
                "content": request.message
            }
        ]
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GIGACHAT_API_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "GigaChat",
                    "messages": messages,
                    "temperature": 0.5
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Chat failed")
            
            return response.json()
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)