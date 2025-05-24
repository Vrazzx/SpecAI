document.addEventListener('DOMContentLoaded', function() {
    // Элементы интерфейса
    const uploadArea = document.getElementById('uploadArea');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const fileListContainer = document.getElementById('fileListContainer');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // Текущий загруженный файл
    let currentFileId = null;
    let currentFileName = null;

    // --- Обработчики событий ---
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    // Drag and Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFiles();
        }
    });
    
    fileInput.addEventListener('change', handleFiles);
    sendBtn.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- Основные функции ---

    // Обработка загрузки файлов
    async function handleFiles() {
        if (!fileInput.files || fileInput.files.length === 0) return;
        
        // Проверяем формат файлов
        const validFiles = Array.from(fileInput.files).filter(file => 
            file.name.toLowerCase().endsWith('.txt')
        );
        
        if (validFiles.length === 0) {
            addMessage('Пожалуйста, загружайте только TXT-файлы!', 'assistant');
            return;
        }

        // Берем первый файл (можно расширить для нескольких)
        const file = validFiles[0];
        
        try {
            // Показываем загрузку
            const loadingMsg = addMessage(`Загружаю файл: ${file.name}...`, 'assistant');
            
            // Отправляем на сервер
            const result = await uploadFile(file);
            
            // Обновляем состояние
            currentFileId = result.file_id;
            currentFileName = file.name;
            
            // Обновляем интерфейс
            updateFileList(file);
            loadingMsg.textContent = `Файл "${file.name}" успешно загружен. Задавайте вопросы!`;
            
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            addMessage(`Ошибка при загрузке файла: ${error.message}`, 'assistant');
        }
    }

    // Обновление списка файлов
    function updateFileList(file) {
        fileList.innerHTML = '';
        
        const listItem = document.createElement('li');
        listItem.className = 'file-item';
        listItem.innerHTML = `
            <span class="file-name">${file.name}</span>
            <button class="btn-secondary" onclick="removeCurrentFile()">Удалить</button>
        `;
        fileList.appendChild(listItem);
        fileListContainer.classList.remove('hidden');
    }

    // Отправка сообщения
    async function sendMessage() {
        const messageText = userInput.value.trim();
        if (!messageText) return;
        
        // Проверяем загружен ли файл
        if (!currentFileId) {
            addMessage('Сначала загрузите файл с документацией!', 'assistant');
            return;
        }
        
        // Добавляем сообщение пользователя
        addMessage(messageText, 'user');
        userInput.value = '';
        
        try {
            // Индикатор загрузки
            const loadingMsg = addMessage("Ассистент анализирует документ...", 'assistant');
            
            // Отправляем запрос
            const response = await askQuestion(messageText);
            
            // Заменяем индикатор на ответ
            loadingMsg.textContent = response.answer;
            
        } catch (error) {
            console.error('Ошибка запроса:', error);
            addMessage(`Ошибка: ${error.message}`, 'assistant');
        }
    }

    // --- API функции ---

    // Загрузка файла на сервер
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

    // Запрос к ассистенту
    async function askQuestion(question) {
        const response = await fetch('http://localhost:8000/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_id: currentFileId,
                question: question
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка сервера');
        }
        
        return await response.json();
    }

    // --- Вспомогательные функции ---

    // Добавление сообщения в чат
    function addMessage(text, sender) {
        const message = document.createElement('div');
        message.className = `message ${sender}-message`;
        message.textContent = text;
        chatMessages.appendChild(message);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return message;
    }

    // Глобальная функция для удаления файла
    window.removeCurrentFile = function() {
        if (!currentFileId) return;
        
        currentFileId = null;
        currentFileName = null;
        fileInput.value = '';
        fileList.innerHTML = '';
        fileListContainer.classList.add('hidden');
        
        addMessage('Файл документации удален', 'assistant');
    };
});