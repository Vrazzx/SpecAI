import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_gigachat.chat_models import GigaChat
from langchain.prompts import ChatPromptTemplate
from langchain.chains import LLMChain


load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("YOUR_API_KEY")

class ChatRequest(BaseModel):
    message: str
    context: list = []

@app.post("/api/analyze")
async def analyze_documentation(file: UploadFile = File(...)):
    try:
        content = await file.read()
        giga = GigaChat(credentials=API_KEY, verify_ssl_certs=False)
        
        prompt = ChatPromptTemplate.from_template(
            "Ты анализируешь техническую документацию. Проанализируй этот документ ({filename}):\n{content}"
        )
        
        chain = prompt | giga
        response = await chain.arun(filename=file.filename, content=content[:5000])
        
        return {"response": response}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_assistant(request: ChatRequest):
    try:
        giga = GigaChat(credentials=API_KEY, verify_ssl_certs=False)
        
        prompt = ChatPromptTemplate.from_template(
            "Ты помогаешь разработчику с техническими вопросами. Контекст: {context}\nВопрос: {message}"
        )
        
        chain = prompt | giga
        response = await chain.arun(
            message=request.message,
            context="\n".join([msg["content"] for msg in request.context]) if request.context else "Нет контекста"
        )
        
        return {"response": response}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
