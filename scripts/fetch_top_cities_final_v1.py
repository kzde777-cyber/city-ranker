import os
import json
import requests
import wbdata
import datetime
import zipfile
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import signal

# ---------------------------
# Настройки
# ---------------------------
OUTPUT_FILE = os.path.join("public", "data", "cities.json")
GEONAMES_URL = "http://download.geonames.org/export/dump/cities15000.zip"
GEONAMES_FILE = "cities15000.txt"
TOP_N = 2000
BATCH_SIZE = 100
MAX_WORKERS = 15

stop_flag = False

# ---------------------------
# Ctrl+C
# ---------------------------
def signal_handler(sig, frame):
    global stop_flag
    print("\n⚠️ Получен сигнал прерывания, сохраняем прогресс...")
    stop_flag = True

signal.signal(signal.SIGINT, signal_handler)

# ---------------------------
# GeoNames
# ---------------------------
def download_geonames():
    if not os.path.exists(GEONAMES_FILE):
        print("📥 Скачиваем GeoNames...")
        r = requests.get(GEONAMES_URL)
        with open("cities.zip", "wb") as f:
            f.write(r.content)
        with zipfile.ZipFile("cities.zip", "r") as zip_ref:
            zip_ref.extractall(".")
    else:
        print("✅ GeoNames уже скачан")

def load_top_cities(limit=TOP_N):
    cities = []
    with open(GEONAMES_FILE, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 15:
                continue
            try:
                population = int(parts[14])
            except ValueError:
                population = 0
            city = {
                "geonameid": int(parts[0]),
                "name": parts[1],
                "country": parts[8],
                "lat": float(parts[4]),
                "lon": float(parts[5]),
                "population": population
            }
            cities.append(city)
    cities.sort(key=lambda x: x["population"], reverse=True)
    return cities[:limit]

# ---------------------------
# World Bank (по стране)
# ---------------------------
def get_worldbank_country_data(country_code):
    indicators = {
        "gdp_per_capita": "NY.GDP.PCAP.CD",
        "unemployment_rate": "SL.UEM.TOTL.ZS",
        "inflation_rate": "FP.CPI.TOTL.ZG",
        "life_expectancy": "SP.DYN.LE00.IN",
        "infant_mortality_rate": "SP.DYN.IMRT.IN",
        "co2_emissions_per_capita": "EN.ATM.CO2E.PC",
        "literacy_rate": "SE.ADT.LITR.ZS",
        "tertiary_education_enrollment": "SE.TER.ENRR"
    }
    data = {}
    try:
        for field, code in indicators.items():
            df = wbdata.get_dataframe({code: field}, country=country_code)
            if not df.empty:
                val = df[field].dropna().iloc[-1]
                data[field] = float(val)
    except Exception:
        pass
    return data

# ---------------------------
# WHO (по стране)
# ---------------------------
def get_who_country_data(country_code):
    endpoints = {
        "doctors_per_1000": "HWF_0001",
        "hospital_beds_per_1000": "HOSP_BEDS"
    }
    data = {}
    for field, code in endpoints.items():
        url = f"https://ghoapi.azureedge.net/api/{code}?$filter=SpatialDim eq '{country_code}'"
        try:
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                js = r.json()
                values = [v.get("NumericValue") for v in js.get("value", []) if v.get("NumericValue") is not None]
                if values:
                    data[field] = float(values[-1])
        except Exception:
            continue
    return data

# ---------------------------
# UNODC (по стране)
# ---------------------------
def load_unodc_data():
    url = "https://dataunodc.un.org/content/data/Crime_by_country.csv"
    try:
        df = pd.read_csv(url)
        df = df.rename(columns={
            "Country": "country_name",
            "Homicide Rate": "homicide_rate",
            "Theft Rate": "theft_rate"
        })
        df = df[["country_name", "homicide_rate", "theft_rate"]]
        return df.set_index("country_name").to_dict(orient="index")
    except Exception:
        return {}

# ---------------------------
# OpenAQ (по городу)
# ---------------------------
def get_openaq(city_name):
    url = f"https://api.openaq.org/v2/latest?city={city_name}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return {}
        data = r.json()
        pm25, no2 = None, None
        if "results" in data and len(data["results"]) > 0:
            for m in data["results"][0].get("measurements", []):
                if m["parameter"] == "pm25":
                    pm25 = m["value"]
                if m["parameter"] == "no2":
                    no2 = m["value"]
        return {"pm25": pm25, "no2": no2}
    except Exception:
        return {}

# ---------------------------
# Климат
# ---------------------------
def get_climate(lat, lon):
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,precipitation_sum&timezone=GMT"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            js = r.json()
            temps = js.get("daily", {}).get("temperature_2m_max", [])
            precs = js.get("daily", {}).get("precipitation_sum", [])
            return {
                "avg_temperature": round(sum(temps)/len(temps), 2) if temps else None,
                "avg_precipitation": round(sum(precs), 2) if precs else None
            }
    except Exception:
        pass
    return {"avg_temperature": None, "avg_precipitation": None}

# ---------------------------
# Трафик (TomTom Traffic Index, открытые данные)
# ---------------------------
def get_transport_index(city_name):
    # Открытые рейтинги TomTom 2023 для крупных городов (пример)
    traffic_dict = {
        "Berlin": 38.2,
        "Prague": 30.5,
        "New York": 46.0,
        "Los Angeles": 47.5,
        "London": 39.1,
        "Paris": 35.0,
        "Tokyo": 28.5,
        "Beijing": 33.0,
        "Shanghai": 32.5
        # остальные города = null
    }
    return {"traffic_congestion_index": traffic_dict.get(city_name)}

# ---------------------------
# Обработка одного города
# ---------------------------
def process_city(city, wb_data, who_data, crime_data):
    if stop_flag:
        return None
    print(f"🔹 Обрабатываем: {city['name']} ({city['geonameid']})")
    record = {
        "geonameid": city["geonameid"],
        "name": city["name"],
        "country": city["country"],
        "lat": city["lat"],
        "lon": city["lon"],
        "population": city["population"]
    }
    record.update(wb_data.get(city["country"], {}))
    record.update(who_data.get(city["country"], {}))
    cname = city.get("country_name") or city.get("country")
    if cname in crime_data:
        record.update(crime_data[cname])
    record.update(get_openaq(city["name"]))
    record.update(get_climate(city["lat"], city["lon"]))
    transport = get_transport_index(city["name"])
    if transport:
        record.update(transport)
    return record

# ---------------------------
# Основной процесс
# ---------------------------
def main():
    download_geonames()
    cities = load_top_cities(TOP_N)
    print(f"🌍 Всего городов для обработки: {len(cities)}")

    # Удаляем старый JSON
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"🗑 Старый файл {OUTPUT_FILE} удалён")

    countries = set([c["country"] for c in cities])
    wb_data = {c: get_worldbank_country_data(c) for c in countries}
    who_data = {c: get_who_country_data(c) for c in countries}
    crime_data = load_unodc_data()

    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_city = {executor.submit(process_city, city, wb_data, who_data, crime_data): city for city in cities}
        for i, future in enumerate(as_completed(future_to_city), 1):
            if stop_flag:
                break
            city_record = future.result()
            if city_record:
                results.append(city_record)
            if i % BATCH_SIZE == 0:
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                print(f"💾 Сохранено {len(results)} городов...")

    # Финальное сохранение
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"✅ Обработано {len(results)} городов, файл: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
