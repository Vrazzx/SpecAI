from docx import Document
import PyPDF2
import pandas as pd
import csv
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
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
from langchain_core.prompts import PromptTemplate
from io import BytesIO

PROMPT_TEMPLATES = {
    "document_analysis": """
    Ты - профессиональный анализатор документаций к IT-продуктам и самого кода. Проанализируй предоставленный текст и выдели ключевые аспекты. Отвечай на русском языке.
    Документ: {document_text}
    
    Анализ должен содержать:
    1. Основную тему документа
    2. Ключевые тезисы
    3. Важные детали
    4. Рекомендации по использованию информации
    
    Анализ:
    """,
    
    "qa_with_context": """
    Ты - технический ассистент. Отвечай на вопросы, используя только предоставленный контекст.
    Если ответа нет в контексте, скажи "Не могу найти ответ в документе". Отвечай на русском языке.
    
    Контекст:
    {context}
    
    Вопрос: {question}
    
    Развернутый ответ:
    """,
    
    "default_chat": """
    Ты - полезный AI-ассистент. Отвечай на вопросы вежливо и профессионально. Отвечай на русском языке.
    Текущий диалог:
    {chat_history}
    
    Новый вопрос: {question}
    
    Ответ:
    """
}
# Настройка логгирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Загрузка переменных окружения
load_dotenv()

# Проверка наличия токена
GIGACHAT_CREDENTIALS = os.getenv("GIGACHAT_TOKEN")
if not GIGACHAT_CREDENTIALS:
    logger.error("GIGACHAT_TOKEN environment variable is not set")

app = FastAPI()
SUPPORTED_CODE_EXTENSIONS = {
    '.py', '.js', '.jsx', '.ts', '.tsx',
    '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rb', '.php', '.swift',
    '.kt', '.rs', '.pl', '.sh', '.rb',
    '.html', '.htm', '.css', '.scss', '.sass',
    '.json', '.xml', '.yaml', '.yml', '.ini',
    '.sql', '.dart', '.vue', '.md'
}
async def read_code_file(file: UploadFile) -> str:
    try:
        content = await file.read()
        return content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail=f"Could not decode file '{file.filename}' as UTF-8 text"
        )
# Настройки CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def process_uploaded_file(file: UploadFile):
    logger.info(f"Processing file: {file.filename} ({file.content_type})")
    try:
        content = file.file.read()
        logger.info(f"Read {len(content)} bytes from file")

        if file.filename.lower().endswith('.txt'):
            text = content.decode("utf-8")
            logger.info(f"TXT content: {text[:2000000]}...")  # первые 2000000 символов
            return text
        
        elif file.filename.lower().endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            text = ""
            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text() or ""
                text += page_text
                logger.info(f"PDF page {i+1}: {page_text[:100]}...")
            return text
        
        elif file.filename.lower().endswith('.docx'):
            doc = Document(BytesIO(content))
            paragraphs = [para.text for para in doc.paragraphs]
            logger.info(f"DOCX paragraphs count: {len(paragraphs)}")
            return "\n".join(paragraphs)
        
        
        elif file.filename.lower().endswith(('.xls', '.xlsx')):
            df = pd.read_excel(BytesIO(content), engine='openpyxl')
            logger.info(f"Excel sheet loaded: {df.shape[0]} rows")
            return df.to_string()
        
        elif file.filename.lower().endswith('.csv'):
            df = pd.read_csv(BytesIO(content))
            logger.info(f"CSV loaded: {df.shape[0]} rows")
            return df.to_string()
        
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type"
            )
    
    except Exception as e:
        logger.error(f"Error reading file content: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error reading file content: {str(e)}"
        )
# Хранилище данных
file_storage: Dict[str, str] = {}
vector_indices: Dict[str, FAISS] = {}

class QuestionRequest(BaseModel):
    question: str

class GigaChatLangChain(LLM):
    """Интеграция GigaChat с LangChain"""
    
    credentials: str
    verify_ssl_certs: bool = False
    scope: str = "GIGACHAT_API_PERS"
    timeout: int = 30
    model:str = "GigaChat-Max"
    
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
                timeout=self.timeout,
                mode = self.model
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
    
    logger.info(f"Uploaded file: {file.filename}, Content-Type: {file.content_type}")
    
    # Проверка наличия расширения
    ext = os.path.splitext(file.filename)[1].lower()
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="File has no extension"
        )
    
    # Все поддерживаемые расширения
    allowed_extensions = {
        '.txt', '.pdf', '.docx', '.xls', '.xlsx', '.csv'
    } | SUPPORTED_CODE_EXTENSIONS
    
    logger.info(f"Allowed extensions: {allowed_extensions}")
    logger.info(f"Detected file extension: {ext}")
    
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Allowed: {', '.join(allowed_extensions)}"
        )
    
    try:
        if ext in SUPPORTED_CODE_EXTENSIONS:
            text_content = await read_code_file(file)
        else:
            text_content = process_uploaded_file(file)
        
        file_id = str(uuid.uuid4())
        file_storage[file_id] = text_content
        vectorstore = await process_text(text_content)
        vector_indices[file_id] = vectorstore
        
        return {"file_id": file_id, "filename": file.filename}
    
    except Exception as e:
        logger.error(f"File upload error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"File upload error: {str(e)}"
        )


@app.delete("/delete/{file_id}")
async def delete_file(file_id: str):
    """Полное удаление файла и его векторного индекса"""
    logger.info(f"Attempting to delete file {file_id}")
    
    if file_id not in file_storage:
        logger.warning(f"File {file_id} not found in storage")
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Удаляем все следы файла
        del file_storage[file_id]
        logger.info(f"Deleted from file_storage: {file_id}")
        
        if file_id in vector_indices:
            del vector_indices[file_id]
            logger.info(f"Deleted from vector_indices: {file_id}")
            
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/ask")
async def ask_question(request: QuestionRequest):
    """Обработка вопросов с контекстом из всех файлов"""
    if not file_storage:
        raise HTTPException(status_code=404, detail="No files uploaded")
    
    try:
        # Объединяем все векторные индексы
        all_vectorstores = list(vector_indices.values())
        if not all_vectorstores:
            raise HTTPException(status_code=400, detail="No processed files available")
            
        # Создаем общий ретривер из всех файлов
        combined_retriever = all_vectorstores[0].as_retriever()
        for vs in all_vectorstores[1:]:
            combined_retriever.add_documents(vs.as_retriever().get_relevant_documents(""))
        
        if not GIGACHAT_CREDENTIALS:
            raise HTTPException(
                status_code=500,
                detail="GigaChat token is not configured"
            )
            
        llm = GigaChatLangChain(credentials=GIGACHAT_CREDENTIALS)
        
        qa_prompt = PromptTemplate(
            template=PROMPT_TEMPLATES["qa_with_context"],
            input_variables=["context", "question"]
        )
        
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=combined_retriever,
            chain_type_kwargs={"prompt": qa_prompt},
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
    
@app.post("/analyze_documents")
async def analyze_documents():
    """Анализ всех загруженных документов"""
    if not file_storage:
        raise HTTPException(status_code=404, detail="No files uploaded")
    
    try:
        llm = GigaChatLangChain(credentials=GIGACHAT_CREDENTIALS)
        combined_text = "\n\n".join([
            f"Файл {file_id}:\n{text[:5000]}" 
            for file_id, text in file_storage.items()
        ])
        
        prompt = PROMPT_TEMPLATES["document_analysis"].format(
            document_text=combined_text
        )
        
        analysis = llm._call(prompt)
        return {"analysis": analysis}
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis error: {str(e)}"
        )

@app.get("/health")
async def health_check():
    """Проверка работоспособности сервера"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)