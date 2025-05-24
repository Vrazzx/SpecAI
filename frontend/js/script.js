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

        const file = files[0];
        const loadingMsg = addMessage(`⏳ Загрузка файла "${file.name}"...`, 'assistant');

        try {
            const result = await uploadFile(file);
            currentFileId = result.file_id;
            updateFileList(file);
            loadingMsg.textContent = `✅ Файл "${file.name}" загружен. Задавайте вопросы!`;
        } catch (error) {
            loadingMsg.textContent = `❌ Ошибка: ${error.message}`;
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

        const loadingMsg = addMessage(' Анализирую...', 'assistant');

        try {
            const result = await askQuestion(messageText);
            loadingMsg.textContent = result.answer;
        } catch (err) {
            loadingMsg.textContent = ` Ошибка: ${err.message}`;
        }
    }

    function updateFileList(file) {
        fileList.innerHTML = `
            <li class="file-item">
                <span>${file.name}</span>
                <button class="btn-secondary" onclick="removeCurrentFile()">Удалить</button>
            </li>`;
        fileListContainer.classList.remove('hidden');
    }

    function addMessage(text, sender) {
        const message = document.createElement('div');
        message.className = `message ${sender}-message`;
        message.textContent = text;
        chatMessages.appendChild(message);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return message;
    }
});