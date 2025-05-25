document.addEventListener('DOMContentLoaded', function () {
    // --- Элементы интерфейса ---
    const uploadArea = document.getElementById('uploadArea');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const fileListContainer = document.getElementById('fileListContainer');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    let currentFileId = null;
    let uploadedFiles = [];
        // Проверка сохраненной темы
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton(savedTheme);

    // Обработчик переключения темы
    themeToggle.addEventListener('click', toggleTheme);

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeButton(newTheme);
    }

    function updateThemeButton(theme) {
        if (theme === 'dark') {
            themeToggle.textContent = '☀️ Светлая тема';
            themeToggle.classList.add('dark-theme');
        } else {
            themeToggle.textContent = '🌙 Темная тема';
            themeToggle.classList.remove('dark-theme');
        }
    }
    // Поддерживаемые расширения
    const allowedExtensions = new Set([
        '.txt', '.pdf', '.docx', '.xls', '.xlsx', '.csv',
        '.py', '.js', '.jsx', '.ts', '.tsx',
        '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.go', '.rb', '.php', '.swift',
        '.kt', '.rs', '.pl', '.sh', '.rb',
        '.html', '.htm', '.css', '.scss', '.sass',
        '.json', '.xml', '.yaml', '.yml', '.ini',
        '.sql', '.dart', '.vue', '.md'
    ]);

    function isValidFile(file) {
        const ext = file.name.toLowerCase().split('.').pop();
        return ext && allowedExtensions.has(`.${ext}`);
    }

    // --- Обработчики событий ---
    uploadBtn.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFiles();
        }
    });

    fileInput.addEventListener('change', handleFiles);
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    window.removeCurrentFile = async () => {
        if (!currentFileId) return;

        try {
            await fetch(`http://localhost:8000/delete/${currentFileId}`, {
                method: 'DELETE'
            });
            currentFileId = null;
            fileList.innerHTML = '';
            fileListContainer.classList.add('hidden');
            addMessage('Файл удален с сервера', 'assistant');
        } catch (err) {
            addMessage(`Ошибка при удалении файла: ${err.message}`, 'assistant');
        }
    };

    // --- Функции загрузки и общения с бэкендом ---

  async function handleFiles() {
    const files = Array.from(fileInput.files).filter(isValidFile);

    if (files.length === 0) {
        addMessage('Пожалуйста, загружайте только поддерживаемые форматы!', 'assistant');
        return;
    }

    for (const file of files) {
        const loadingMsg = addMessage(`⏳ Загрузка файла "${file.name}"...`, 'assistant');
        
        try {
            const result = await uploadFile(file);
            uploadedFiles.push({
                id: result.file_id,
                file: file
            });
            updateFileList(file, result.file_id); // Передаем file_id для управления
            loadingMsg.textContent = `✅ Файл "${file.name}" загружен.`;
        } catch (error) {
            loadingMsg.textContent = `❌ Ошибка: ${error.message}`;
        }
    }
}

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:8000/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка загрузки');
        }

        return await response.json();
    }

    async function askQuestion(question) {
        const response = await fetch('http://localhost:8000/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: currentFileId, question })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка сервера');
        }

        return await response.json();
    }

async function sendMessage() {
    const messageText = userInput.value.trim();
    if (!messageText) return;
    if (!currentFileId) {
        addMessage('Сначала загрузите файл!', 'assistant');
        return;
    }

    addMessage(messageText, 'user');
    userInput.value = '';

    const loadingMsg = addMessage('Анализирую...', 'assistant');

    try {
        const result = await askQuestion(messageText);
        chatMessages.removeChild(loadingMsg);
        addMessage(result.answer, 'assistant', true);
    } catch (err) {
        loadingMsg.textContent = `Ошибка: ${err.message}`;
    }
}
    
    // Функция форматирования текста сообщения
function formatMessageText(text) {
    // Обработка блоков кода
    text = text.replace(/```(\w*)([\s\S]*?)```/g, function(match, lang, code) {
        // Сохраняем все пробелы и переносы
        code = code.replace(/^[\r\n]+|[\r\n]+$/g, ''); // Убираем только лишние переносы в начале/конце
        code = escapeHtml(code); // Экранируем HTML
        
        // Добавляем подсветку синтаксиса
        return `<div class="code-block"><div class="code-header">${lang || 'text'}</div><pre><code class="language-${lang || 'plaintext'}">${code}</code></pre></div>`;
    });

    // Обработка inline кода
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Жирный текст
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Курсив
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Обработка переносов строк для обычного текста
    text = text.split('\n').map(paragraph => {
        if (paragraph.trim() === '') return '<br>';
        return `<p>${paragraph}</p>`;
    }).join('');

    return text;

    function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/ /g, "&nbsp;")  // Заменяем пробелы на неразрывные
        .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"); // Заменяем табуляцию на 4 пробела
}
}
function updateFileList(file, fileId) {
    const fileItem = document.createElement('li');
    fileItem.className = 'file-item';
    fileItem.dataset.fileId = fileId; // Сохраняем ID файла в data-атрибуте
    
    fileItem.innerHTML = `
        <span class="file-name">${file.name}</span>
        <div class="file-actions">
            <button class="delete-btn" onclick="removeFile('${fileId}')" title="Удалить файл"></button>
            <button class="select-btn" onclick="selectFile('${fileId}')" title="Выбрать файл"></button>
        </div>
    `;
    
    fileList.appendChild(fileItem);
    fileListContainer.classList.remove('hidden');
}

function addMessage(text, sender, isFormatted = false) {
    const message = document.createElement('div');
    message.className = `message ${sender}-message`;
    
    if (sender === 'assistant' && isFormatted) {
        message.innerHTML = formatMessageText(text);
        
        if (typeof hljs !== 'undefined') {
            // Подсветка синтаксиса
            message.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
                
                // Добавляем кнопку копирования
                const codeHeader = block.closest('.code-block')?.querySelector('.code-header');
                if (codeHeader && !codeHeader.querySelector('.copy-btn')) {
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.innerHTML = '📋';
                    copyBtn.title = 'Копировать код';
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(block.textContent);
                        copyBtn.innerHTML = '✓ Скопировано!';
                        setTimeout(() => copyBtn.innerHTML = '📋', 2000);
                    });
                    codeHeader.appendChild(copyBtn);
                }
            });
        }
    } else {
        message.textContent = text;
    }
    
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
}


// Выбор файла для вопросов
window.selectFile = (fileId) => {
    currentFileId = fileId;
    addMessage(`Файл "${getFileNameById(fileId)}" выбран для вопросов.`, 'assistant');
};

// Удаление файла
window.removeFile = async (fileId) => {
    try {
        await fetch(`http://localhost:8000/delete/${fileId}`, { method: 'DELETE' });
        uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
        document.querySelector(`.file-item[data-file-id="${fileId}"]`).remove();
        addMessage('Файл удален', 'assistant');
    } catch (err) {
        addMessage(`Ошибка при удалении: ${err.message}`, 'assistant');
    }
};

// Вспомогательная функция для получения имени файла по ID
function getFileNameById(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    return file ? file.file.name : 'Неизвестный файл';
}
});