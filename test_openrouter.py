import os
import requests
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Получаем API ключ из переменных окружения
api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    raise ValueError("API ключ не найден. Убедитесь, что он задан в .env файле.")

# URL для отправки запроса
url = "https://openrouter.ai/api/v1/chat/completions"

# Заголовки запроса
headers = {
    "Authorization": f"Bearer {api_key}",
    "HTTP-Referer": "https://your-app.com",  # Замените на URL вашего приложения
    "X-Title": "Your App Name",  # Замените на название вашего приложения
}

# Данные запроса
data = {
    "model": "openai/gpt-3.5-turbo",  # Выберите нужную модель
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, who are you?"}
    ]
}

# Отправляем POST запрос
response = requests.post(url, headers=headers, json=data)

# Проверяем статус ответа
if response.status_code == 200:
    print("Ответ от модели:", response.json())
else:
    print(f"Ошибка {response.status_code}: {response.text}")
