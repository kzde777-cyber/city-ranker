import os
import re
import io
import json
import shutil
import asyncio
import aiohttp
import pandas as pd
from bs4 import BeautifulSoup
import openai  # нужен openai==1.0.0+ (работает с OpenRouter API)

# =====================
# БАЗОВЫЕ НАСТРОЙКИ
# =====================

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

openai.api_key = os.getenv("OPENROUTER_API_KEY")
openai.base_url = "https://openrouter.ai/api/v1"

# =====================
# ХЕЛПЕРЫ
# =====================

def normalize_country_name(name: str) -> str:
    return COUNTRY_ALIASES.get(name, name)

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
    match = re.search(r"\d{1,3}(?:\.\d+)?", text)
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

# =====================
# LLM ДОПОЛНЕНИЕ
# =====================

async def fill_with_llm(param, data_dict):
    """
    param: str (например, "homicide")
    data_dict: {"France": 1.2, "Germany": None, "USA": 5.0}
    """
    missing = [k for k, v in data_dict.items() if v is None]
    if not missing:
        return data_dict

    prompt = f"""
You are given values of the parameter "{param}" for some countries.
Some are missing (null). Fill them with reasonable estimates, ensuring consistency.

Input JSON:
{json.dumps(data_dict, ensure_ascii=False, indent=2)}

Return only valid JSON, same structure (country: value).
"""

    try:
        resp = await openai.ChatCompletion.acreate(
            model="cognitivecomputations/dolphin3.0-r1-mistral-24b:free",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        content = resp.choices[0].message.content
        content = content.replace("```json", "").replace("```", "").strip()
        filled = json.loads(content)
        return filled
    except Exception as e:
        print(f"⚠️ LLM error for {param}: {e}")
        return data_dict

# =====================
# ОСНОВНОЙ СКРИПТ
# =====================

async def main_async():
    input_file = "public/data/cities_final_with_continent.json"
    output_file = "public/data/parameters.json"

    with open(input_file, "r", encoding="utf-8") as f:
        cities = json.load(f)

    countries = {normalize_country_name(c.get("country_name") or c.get("country")) for c in cities}
    country_cache = {}

    async with aiohttp.ClientSession() as session:
        tasks = {country: asyncio.create_task(fetch_country_data(session, country)) for country in countries}
        for country, task in tasks.items():
            country_cache[country] = await task
            print(f"✅ {country}")

    # Переструктурируем в параметр -> страна
    param_data = {param: {} for param in TABLES.keys()}
    for country, pdata in country_cache.items():
        for param, val in pdata.items():
            param_data[param][country] = val

    # Запускаем LLM-дополнение для каждого параметра
    for param, dct in param_data.items():
        print(f"🤖 Дополняем {param}...")
        param_data[param] = await fill_with_llm(param, dct)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(param_data, f, indent=2, ensure_ascii=False)

    print(f"🎉 Сохранено в {output_file}")

if __name__ == "__main__":
    asyncio.run(main_async())
