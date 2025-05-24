import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import uuid
from dotenv import load_dotenv
from langchain.text_splitter import CharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import RetrievalQA
from langchain_core.language_models import LLM
from gigachat import GigaChat
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.outputs import Generation, LLMResult
import logging

# Настройка логгирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Проверка наличия токена
GIGACHAT_CREDENTIALS = os.getenv("GIGACHAT_TOKEN")
if not GIGACHAT_CREDENTIALS:
    logger.error("GIGACHAT_TOKEN environment variable is not set")
    # Вместо вызова raise здесь, мы просто выведем сообщение
    # и позволим приложению запуститься, но запросы к GigaChat будут падать
    # с понятным сообщением об ошибке

app = FastAPI()

# Настройки CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Хранилище данных
file_storage: Dict[str, str] = {}
vector_indices: Dict[str, FAISS] = {}

class QuestionRequest(BaseModel):
    file_id: str
    question: str

class GigaChatLangChain(LLM):
    """Интеграция GigaChat с LangChain"""
    
    credentials: str
    verify_ssl_certs: bool = False
    scope: str = "GIGACHAT_API_PERS"
    timeout: int = 30
    
    @property
    def _llm_type(self) -> str:
        return "gigachat"
    
    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        if not self.credentials:
            raise ValueError("GigaChat credentials are not configured")
        
        try:
            client = GigaChat(
                credentials=self.credentials,
                verify_ssl_certs=self.verify_ssl_certs,
                scope=self.scope,
                timeout=self.timeout
            )
            response = client.chat(prompt)
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"GigaChat API error: {str(e)}")
            raise ValueError(f"GigaChat API error: {str(e)}")
    
    def _generate(
        self,
        prompts: List[str],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> LLMResult:
        generations = []
        for prompt in prompts:
            try:
                text = self._call(prompt, stop=stop, run_manager=run_manager, **kwargs)
                generations.append([Generation(text=text)])
            except Exception as e:
                logger.error(f"Error generating response: {str(e)}")
                raise ValueError(f"Error generating response: {str(e)}")
        
        return LLMResult(generations=generations)

async def process_text(text: str):
    """Обработка текста с созданием векторного индекса"""
    try:
        text_splitter = CharacterTextSplitter(
            separator="\n",
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )
        chunks = text_splitter.split_text(text)
        
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        
        return FAISS.from_texts(chunks, embeddings)
    except Exception as e:
        logger.error(f"Text processing error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Text processing error: {str(e)}"
        )

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Загрузка и обработка файла"""
    if not file.filename.lower().endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")
    
    try:
        contents = await file.read()
        text_content = contents.decode("utf-8")
        file_id = str(uuid.uuid4())
        
        file_storage[file_id] = text_content
        vectorstore = await process_text(text_content)
        vector_indices[file_id] = vectorstore
        
        return {"file_id": file_id, "filename": file.filename}
    except Exception as e:
        logger.error(f"File upload error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"File upload error: {str(e)}"
        )

@app.post("/ask")
async def ask_question(request: QuestionRequest):
    """Обработка вопросов с контекстом из файла"""
    if request.file_id not in file_storage:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        vectorstore = vector_indices[request.file_id]
        
        if not GIGACHAT_CREDENTIALS:
            raise HTTPException(
                status_code=500,
                detail="GigaChat token is not configured"
            )
            
        llm = GigaChatLangChain(credentials=GIGACHAT_CREDENTIALS)
        
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vectorstore.as_retriever(),
            return_source_documents=True
        )
        
        result = qa_chain.invoke({"query": request.question})
        
        return {
            "answer": result["result"],
            "sources": [doc.metadata for doc in result["source_documents"]]
        }
    except Exception as e:
        logger.error(f"Question processing error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Question processing error: {str(e)}"
        )

@app.get("/health")
async def health_check():
    """Проверка работоспособности сервера"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)