import os
import re
import io
import json
import shutil
import asyncio
import aiohttp
import pandas as pd
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

# Загружаем ключ из .env
load_dotenv()
client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0 Safari/537.36"
    )
}

COUNTRY_ALIASES = {
    "Turkiye": "Turkey",
    "Turkey": "Turkey",
    "Turquie": "Turkey",
    "Czechia": "Czech Republic",
    "Ivory Coast": "Côte d'Ivoire",
    "Russia": "Russian Federation",
    "Russian Federation": "Russia",
    "South Korea": "Republic of Korea",
    "North Korea": "Democratic People's Republic of Korea",
    "Syria": "Syrian Arab Republic",
    "Iran": "Iran (Islamic Republic of)",
    "Vietnam": "Viet Nam",
    "United States": "United States of America",
    "Venezuela": "Venezuela (Bolivarian Republic of)",
    "Bolivia": "Bolivia (Plurinational State of)",
    "Tanzania": "Tanzania, United Republic of",
    "Moldova": "Republic of Moldova",
    "Laos": "Lao People's Democratic Republic",
    "Brunei": "Brunei Darussalam",
}

def normalize_country_name(name: str) -> str:
    return COUNTRY_ALIASES.get(name, name)

TABLES = {
    "homicide": "https://en.wikipedia.org/wiki/List_of_countries_by_intentional_homicide_rate",
    "traffic_deaths": "https://en.wikipedia.org/wiki/List_of_countries_by_traffic-related_death_rate",
    "incarceration": "https://en.wikipedia.org/wiki/List_of_countries_by_incarceration_rate",
    "suicide": "https://en.wikipedia.org/wiki/List_of_countries_by_suicide_rate",
    "infant_mortality": "https://en.wikipedia.org/wiki/List_of_countries_by_infant_and_under-five_mortality_rates",
    "hiv": "https://en.wikipedia.org/wiki/HIV_adult_prevalence_rate",
    "freedom": "https://en.wikipedia.org/wiki/List_of_freedom_indices",
    "economic_freedom": "https://en.wikipedia.org/wiki/List_of_sovereign_states_by_economic_freedom",
    "corruption": "https://en.wikipedia.org/wiki/Corruption_Perceptions_Index",
    "hdi": "https://en.wikipedia.org/wiki/List_of_countries_by_Human_Development_Index",
    "pisa": "https://en.wikipedia.org/wiki/Programme_for_International_Student_Assessment",
    "english_speakers": "https://en.wikipedia.org/wiki/List_of_countries_by_English-speaking_population",
    "languages": "https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers",
}

CACHE_DIR = "tmp"
os.makedirs(CACHE_DIR, exist_ok=True)

def cache_path(url: str) -> str:
    fname = re.sub(r"[^a-zA-Z0-9]+", "_", url)
    return os.path.join(CACHE_DIR, f"{fname}.html")

async def fetch_html(session, url):
    path = cache_path(url)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    async with session.get(url, headers=HEADERS) as resp:
        resp.raise_for_status()
        html = await resp.text()
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        return html

def parse_numeric_value(text):
    if not text:
        return None
    match = re.search(r"\d{1,3}(?:\.\d+)?", text.replace(",", ""))
    if match:
        return float(match.group(0))
    return None

async def fetch_country_table(session, url, country):
    try:
        html = await fetch_html(session, url)
        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table", {"class": ["wikitable", "sortable"]})
        for table in tables:
            df = pd.read_html(io.StringIO(str(table)), flavor="bs4")[0]
            for _, row in df.iterrows():
                row_str = " ".join(str(x) for x in row.tolist())
                if re.search(rf"\b{re.escape(country)}\b", row_str, re.IGNORECASE):
                    return parse_numeric_value(row_str)
    except Exception:
        return None
    return None

async def fetch_country_data(session, country):
    tasks = [fetch_country_table(session, url, country) for url in TABLES.values()]
    results = await asyncio.gather(*tasks)
    return dict(zip(TABLES.keys(), results))

def fetch_with_llm(param: str, city: str, country: str):
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Ты возвращаешь только JSON без комментариев."},
                {"role": "user", "content": f"Дай численное значение для параметра '{param}' для города {city}, {country}. Пример: {{\"{param}\": число}}"}
            ],
            temperature=0.2,
        )
        content = completion.choices[0].message.content.strip()
        data = json.loads(content)
        return data.get(param)
    except Exception as e:
        print(f"⚠️ LLM error for {param} / {city}: {e}")
        return None

async def main_async():
    input_file = "public/data/cities_final_with_continent.json"
    output_file = "public/data/parameters.json"
    backup_file = output_file.replace(".json", "_backup.json")

    # Бэкап старого JSON
    if os.path.exists(output_file):
        shutil.copy(output_file, backup_file)
        print(f"🗂 Бэкап старого parameters.json: {backup_file}")

    with open(input_file, "r", encoding="utf-8") as f:
        cities = json.load(f)

    # Уникальные страны
    countries = {normalize_country_name(city.get("country_name") or city.get("country")) for city in cities}
    country_cache = {}

    async with aiohttp.ClientSession() as session:
        tasks = {country: asyncio.create_task(fetch_country_data(session, country)) for country in countries}
        for country, task in tasks.items():
            country_cache[country] = await task
            print(f"✅ Данные для {country} собраны")

    # Итоговая структура: параметр -> {город: значение}
    parameters = {param: {} for param in TABLES.keys()}

    for city in cities:
        city_name = city["name"]
        country_raw = city.get("country_name") or city.get("country")
        country = normalize_country_name(country_raw)
        stats = country_cache.get(country, {})

        for param in TABLES.keys():
            value = stats.get(param)
            if value is None:
                # fallback через LLM
                print(f"🤖 Дополняем {param} для {city_name}...")
                value = fetch_with_llm(param, city_name, country)
            parameters[param][city_name] = value

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(parameters, f, indent=2, ensure_ascii=False)

    print(f"🎉 Сохранено в {output_file}")

if __name__ == "__main__":
    asyncio.run(main_async())
