import json
import math
import os
import time

from openai import OpenAI

# Настройка OpenRouter
client = OpenAI(api_key="YOUR_OPENROUTER_KEY")

cities = [
    {"name": "Tokyo", "country": "Japan"},
    {"name": "Delhi", "country": "India"},
    {"name": "Shanghai", "country": "China"},
    {"name": "São Paulo", "country": "Brazil"},
    {"name": "Mexico City", "country": "Mexico"},
    {"name": "Cairo", "country": "Egypt"},
    {"name": "Mumbai", "country": "India"},
    {"name": "Beijing", "country": "China"},
    {"name": "Dhaka", "country": "Bangladesh"},
    {"name": "Osaka", "country": "Japan"},
    {"name": "New York", "country": "USA"},
    {"name": "Karachi", "country": "Pakistan"},
    {"name": "Buenos Aires", "country": "Argentina"},
    {"name": "Chongqing", "country": "China"},
    {"name": "Istanbul", "country": "Turkey"},
    {"name": "Kolkata", "country": "India"},
    {"name": "Manila", "country": "Philippines"},
    {"name": "Lagos", "country": "Nigeria"},
    {"name": "Rio de Janeiro", "country": "Brazil"},
    {"name": "Tianjin", "country": "China"}
]

metrics = [
    "homicide",
    "traffic_deaths",
    "incarceration",
    "suicide",
    "infant_mortality",
    "hiv",
    "freedom",
    "economic_freedom",
    "corruption",
    "hdi",
    "pisa",
    "english_speakers",
    "languages"
]

ranges = {
    "homicide": (0, 100),
    "traffic_deaths": (0, 100),
    "incarceration": (0, 2000),
    "suicide": (0, 50),
    "infant_mortality": (0, 200),
    "hiv": (0, 50000000),
    "freedom": (0, 100),
    "economic_freedom": (1900, 2030),
    "corruption": (0, 100),
    "hdi": (0, 1),
    "pisa": (0, 600),
    "english_speakers": (0, 2000000000),
    "languages": (0, 1000)
}

CACHE_FILE = "city_data_cache.json"

def parse_numeric(value, key=None):
    """Преобразуем текстовое значение в число и проверяем диапазон"""
    try:
        num = float(value)
        if math.isnan(num) or math.isinf(num):
            return None
        if key and key in ranges:
            low, high = ranges[key]
            if not (low <= num <= high):
                return None
        return num
    except:
        return None

def fetch_city_data(city_name, country_name):
    """Запрос к LLM для получения данных по городу и стране"""
    prompt = f"""
    Provide the following statistics for the city "{city_name}" in "{country_name}":
    - homicide rate per 100,000
    - traffic deaths per 100,000
    - incarceration rate per 100,000
    - suicide rate per 100,000
    - infant mortality per 1,000
    - HIV cases (total number)
    - freedom index (0-100)
    - economic freedom score (year)
    - corruption perception index (0-100)
    - HDI (0-1)
    - PISA score (0-600)
    - English speakers (number in city)
    - Languages spoken (number)

    Return only JSON with keys exactly as above, using null for unknown or out-of-range values.
    """

    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model="gpt-5-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0
            )
            text = response.choices[0].message.content
            data = json.loads(text)
            for key in data:
                if key in metrics:
                    data[key] = parse_numeric(data[key], key)
            return data
        except Exception as e:
            print(f"⚠️ Ошибка при получении данных для {city_name}: {e}")
            time.sleep(2)
    return {k: None for k in metrics}

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

def main():
    cache = load_cache()
    all_data = {}
    for city in cities:
        name = city["name"]
        if name in cache:
            print(f"ℹ️ Используем кэшированные данные для {name}")
            data = cache[name]
        else:
            print(f"🌍 Загружаем данные для {name} ({city['country']}) ...")
            data = fetch_city_data(name, city["country"])
            cache[name] = data
            save_cache(cache)
            time.sleep(1)  # пауза между запросами
        all_data[name] = data

    with open("city_data.json", "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print("✅ Все данные загружены и сохранены в city_data.json")

if __name__ == "__main__":
    main()
