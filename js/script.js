document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const fileListContainer = document.getElementById('fileListContainer');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // Обработка загрузки файлов
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#4361ee';
        uploadArea.style.backgroundColor = 'rgba(67, 97, 238, 0.1)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#adb5bd';
        uploadArea.style.backgroundColor = 'transparent';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#adb5bd';
        uploadArea.style.backgroundColor = 'transparent';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFiles();
        }
    });
    
    fileInput.addEventListener('change', handleFiles);
    
    function handleFiles() {
        if (fileInput.files.length === 0) return;
        
        fileList.innerHTML = '';
        
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const listItem = document.createElement('li');
            listItem.className = 'file-item';
            
            listItem.innerHTML = `
                <span class="file-name" title="${file.name}">${file.name}</span>
                <div class="file-actions">
                    <button class="btn-secondary" onclick="removeFile(this, ${i})">Удалить</button>
                </div>
            `;
            
            fileList.appendChild(listItem);
        }
        
        fileListContainer.classList.remove('hidden');
        
        // Добавляем сообщение в чат о загрузке файлов
        const message = document.createElement('div');
        message.className = 'message user-message';
        message.textContent = `Загружено ${fileInput.files.length} файл(ов) документации`;
        chatMessages.appendChild(message);
        
        // Имитируем ответ ассистента
        setTimeout(() => {
            const response = document.createElement('div');
            response.className = 'message assistant-message';
            response.textContent = 'Отлично! Я проанализировал документацию. Теперь вы можете задавать вопросы или просить помочь с оптимизацией кода.';
            chatMessages.appendChild(response);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 1000);
    }
    
    // Обработка отправки сообщения
    sendBtn.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    function sendMessage() {
        const messageText = userInput.value.trim();
        if (!messageText) return;
        
        // Добавляем сообщение пользователя
        const userMessage = document.createElement('div');
        userMessage.className = 'message user-message';
        userMessage.textContent = messageText;
        chatMessages.appendChild(userMessage);
        
        // Очищаем поле ввода
        userInput.value = '';
        // Прокручиваем чат вниз
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Имитируем ответ ассистента
        setTimeout(() => {
            const response = document.createElement('div');
            response.className = 'message assistant-message';
            
            // Простая имитация ответа в зависимости от вопроса
            if (messageText.toLowerCase().includes('привет') || messageText.toLowerCase().includes('hello')) {
                response.textContent = 'Привет! Как я могу помочь вам с документацией?';
            } else if (messageText.toLowerCase().includes('оптимизировать') || messageText.toLowerCase().includes('улучшить')) {
                response.textContent = 'На основе документации, я рекомендую следующие оптимизации: ...';
            } else {
                response.textContent = 'Согласно загруженной документации, ответ на ваш вопрос: ...';
            }
            
            chatMessages.appendChild(response);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 1000);
    }
    
    // Глобальная функция для удаления файлов
    window.removeFile = function(button, index) {
        const dt = new DataTransfer();
        const files = fileInput.files;
        
        for (let i = 0; i < files.length; i++) {
            if (i !== index) {
                dt.items.add(files[i]);
            }
        }
        
        fileInput.files = dt.files;
        
        if (fileInput.files.length === 0) {
            fileListContainer.classList.add('hidden');
        }
        
        handleFiles();
    };
});