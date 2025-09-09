import os
import re
import io
import json
import shutil
import requests
import pandas as pd
from bs4 import BeautifulSoup

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

def fetch_html(url):
    path = cache_path(url)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    html = r.text
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return html

def fetch_country_value(url, country):
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table", {"class": ["wikitable", "sortable"]})
        for table in tables:
            df = pd.read_html(io.StringIO(str(table)), flavor="bs4")[0]
            for _, row in df.iterrows():
                row_str = " ".join(str(x) for x in row.tolist())
                if re.search(rf"\b{re.escape(country)}\b", row_str, re.IGNORECASE):
                    return row_str
    except Exception:
        return None
    return None

def parse_numeric_value(text):
    if not text:
        return None
    match = re.search(r"\d{1,3}(?:\.\d+)?", text)
    if match:
        return float(match.group(0))
    return None

def main():
    input_file = "public/data/cities_final_with_continent.json"
    backup_file = input_file.replace(".json", "_backup.json")

    if os.path.exists(input_file):
        shutil.copy(input_file, backup_file)
        print(f"🗂 Бэкап старого JSON: {backup_file}")

    with open(input_file, "r", encoding="utf-8") as f:
        cities = json.load(f)

    country_cache = {}  # ← сюда сохраняем все данные по странам

    for city in cities:
        country_raw = city.get("country_name") or city.get("country")
        country = normalize_country_name(country_raw)

        if country not in country_cache:
            country_data = {}
            for key, url in TABLES.items():
                raw_val = fetch_country_value(url, country)
                num_val = parse_numeric_value(raw_val)
                country_data[key] = num_val
                print(f"[{key}] {country}: found={'True' if raw_val else 'False'} value={num_val}")
            country_cache[country] = country_data

        # Применяем данные страны ко всем городам этой страны
        city.update(country_cache[country])

    with open(input_file, "w", encoding="utf-8") as f:
        json.dump(cities, f, indent=2, ensure_ascii=False)

    print(f"✅ Готово. Обновлено {len(cities)} городов → {input_file}")

if __name__ == "__main__":
    main()
