import os
import json
import time
import requests
import wbdata
import datetime
import zipfile
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_FILE = os.path.join("public", "data", "cities.json")
BACKUP_FILE = os.path.join("public", "data", "cities_backup.json")
GEONAMES_URL = "http://download.geonames.org/export/dump/cities15000.zip"
GEONAMES_FILE = "cities15000.txt"
BATCH_SIZE = 500
MAX_WORKERS = 20

# ---------------------------
# 1. GeoNames
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

def load_cities(limit=None):
    cities = []
    with open(GEONAMES_FILE, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 15:
                continue
            city = {
                "geonameid": int(parts[0]),
                "name": parts[1],
                "country": parts[8],
                "lat": float(parts[4]),
                "lon": float(parts[5]),
                "population": int(parts[14]) if parts[14].isdigit() else None
            }
            cities.append(city)
            if limit and len(cities) >= limit:
                break
    return cities

# ---------------------------
# 2. World Bank
# ---------------------------
def get_worldbank_data(country_code):
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
            df = wbdata.get_dataframe({code: field}, country=country_code,
                                      data_date=datetime.datetime(2019, 1, 1))
            if not df.empty:
                data[field] = float(df.iloc[0][0])
    except Exception:
        pass
    return data

# ---------------------------
# 3. WHO
# ---------------------------
def get_who_data(country_code):
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
                if "value" in js and len(js["value"]) > 0:
                    val = js["value"][0].get("NumericValue")
                    if val is not None:
                        data[field] = float(val)
        except Exception:
            continue
    return data

# ---------------------------
# 4. OpenAQ
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
# 5. UNODC
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
# 6. Климат
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
# 7. Транспорт (пример)
# ---------------------------
def get_transport_index(city_name):
    traffic_dict = {
        "Berlin": 38.2,
        "Prague": 30.5
    }
    return {"traffic_congestion_index": traffic_dict.get(city_name)}

# ---------------------------
# 8. Обработка одного города
# ---------------------------
def process_city(city, crime_data):
    print(f"🔹 Обрабатываем: {city['name']} ({city['geonameid']})")
    record = {
        "geonameid": city["geonameid"],
        "name": city["name"],
        "country": city["country"],
        "lat": city["lat"],
        "lon": city["lon"],
        "population": city["population"]
    }
    record.update(get_worldbank_data(city["country"]))
    record.update(get_who_data(city["country"]))
    record.update(get_openaq(city["name"]))
    record.update(get_climate(city["lat"], city["lon"]))
    transport = get_transport_index(city["name"])
    if transport:
        record.update(transport)

    cname = city.get("country_name") or city.get("country")
    if cname in crime_data:
        record.update(crime_data[cname])
    return record

# ---------------------------
# 9. Основной процесс с ThreadPool
# ---------------------------
def main():
    download_geonames()
    all_cities = load_cities()
    print(f"🌍 Всего городов: {len(all_cities)}")

    # Backup старого JSON
    if os.path.exists(OUTPUT_FILE):
        os.rename(OUTPUT_FILE, BACKUP_FILE)
        print(f"📦 Сделан backup старого JSON: {BACKUP_FILE}")

    results = []
    crime_data = load_unodc_data()
    cities_to_process = all_cities

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_city = {executor.submit(process_city, city, crime_data): city for city in cities_to_process}
        for i, future in enumerate(as_completed(future_to_city), 1):
            city_record = future.result()
            results.append(city_record)

            # Сохраняем батч
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
