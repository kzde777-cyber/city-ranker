import os
import json
import zipfile
from pathlib import Path
from typing import Dict, Any, Optional, List
import asyncio
import aiohttp
from aiohttp import ClientTimeout

# ---------------------------
# Настройки
# ---------------------------
OUTPUT_FILE = os.path.join("public", "data", "cities_final_with_continent.json")
BACKUP_FILE = os.path.join("public", "data", "cities_final_with_continent_backup.json")

GEONAMES_URL = "https://download.geonames.org/export/dump/cities15000.zip"
GEONAMES_ZIP = "cities15000.zip"
GEONAMES_FILE = "cities15000.txt"
ADMIN1_FILE = "admin1CodesASCII.txt"

TOP_N = 2000  # Изменено с 10 на 2000
TIMEOUT = 20

WB_INDICATORS = {
    "gdp_per_capita": "NY.GDP.PCAP.CD",
    "gni_per_capita": "NY.GNP.PCAP.CD",
    "unemployment_rate": "SL.UEM.TOTL.ZS",
    "inflation_rate": "FP.CPI.TOTL.ZG",
    "life_expectancy": "SP.DYN.LE00.IN",
    "infant_mortality_rate": "SP.DYN.IMRT.IN",
    "co2_emissions_per_capita": "EN.ATM.CO2E.PC",
    "literacy_rate": "SE.ADT.LITR.ZS",
    "tertiary_education_enrollment": "SE.TER.ENRR",
    "population_density": "EN.POP.DNST",
    "pm25": "EN.ATM.PM25.MC.M3",
    "pm10": "EN.ATM.PM10.MC.M3",
    "homicide_rate": "VC.IHR.PSRC.P5",
    "drought_risk": "AG.LND.DRYF.ZS",
    "flood_risk": "ER.FLD.CAPT.ZS",
}

WHO_ENDPOINTS = {
    "doctors_per_1000": "HWF_0001",
    "hospital_beds_per_1000": "HOSP_BEDS"
}

# ---------------------------
# Континенты (ISO2 → continent)
# ---------------------------
CONTINENT_MAP = {
    "AF": "Asia","AL": "Europe","DZ": "Africa","AS": "Oceania","AD": "Europe","AO": "Africa",
    "AI": "North America","AQ": "Antarctica","AG": "North America","AR": "South America","AM": "Asia",
    "AW": "North America","AU": "Oceania","AT": "Europe","AZ": "Asia","BS": "North America","BH": "Asia",
    "BD": "Asia","BB": "North America","BY": "Europe","BE": "Europe","BZ": "North America","BJ": "Africa",
    "BM": "North America","BT": "Asia","BO": "South America","BA": "Europe","BW": "Africa","BR": "South America",
    "IO": "Asia","BN": "Asia","BG": "Europe","BF": "Africa","BI": "Africa","KH": "Asia","CM": "Africa",
    "CA": "North America","CV": "Africa","KY": "North America","CF": "Africa","TD": "Africa","CL": "South America",
    "CN": "Asia","CX": "Oceania","CC": "Oceania","CO": "South America","KM": "Africa","CG": "Africa",
    "CD": "Africa","CK": "Oceania","CR": "North America","HR": "Europe","CU": "North America","CW": "Oceania",
    "CY": "Asia","CZ": "Europe","CI": "Africa","DK": "Europe","DJ": "Africa","DM": "North America",
    "DO": "North America","EC": "South America","EG": "Africa","SV": "North America","GQ": "Africa",
    "ER": "Africa","EE": "Europe","SZ": "Africa","ET": "Africa","FK": "South America","FO": "Europe",
    "FJ": "Oceania","FI": "Europe","FR": "Europe","GF": "South America","PF": "Oceania","GA": "Africa",
    "GM": "Africa","GE": "Asia","DE": "Europe","GH": "Africa","GI": "Europe","GR": "Europe","GL": "North America",
    "GD": "North America","GU": "Oceania","GT": "North America","GG": "Europe","GN": "Africa","GW": "Africa",
    "GY": "South America","HT": "North America","HM": "Antarctica","HN": "North America","HK": "Asia",
    "HU": "Europe","IS": "Europe","IN": "Asia","ID": "Asia","IR": "Asia","IQ": "Asia","IE": "Europe","IL": "Asia",
    "IT": "Europe","JM": "North America","JP": "Asia","JE": "Europe","JO": "Asia","KZ": "Asia","KE": "Africa",
    "KI": "Oceania","KP": "Asia","KR": "Asia","KW": "Asia","KG": "Asia","LA": "Asia","LV": "Europe","LB": "Asia",
    "LS": "Africa","LR": "Africa","LY": "Africa","LI": "Europe","LT": "Europe","LU": "Europe","MO": "Asia",
    "MK": "Europe","MG": "Africa","MW": "Africa","MY": "Asia","MV": "Asia","ML": "Africa","MT": "Europe",
    "MH": "Oceania","MQ": "North America","MR": "Africa","MU": "Africa","YT": "Africa","MX": "North America",
    "FM": "Oceania","MD": "Europe","MC": "Europe","MN": "Asia","ME": "Europe","MS": "North America",
    "MA": "Africa","MZ": "Africa","MM": "Asia","NA": "Africa","NR": "Oceania","NP": "Asia","NL": "Europe",
    "NC": "Oceania","NZ": "Oceania","NI": "North America","NE": "Africa","NG": "Africa","NU": "Oceania",
    "NF": "Oceania","MP": "Oceania","NO": "Europe","OM": "Asia","PK": "Asia","PW": "Oceania","PS": "Asia",
    "PA": "North America","PG": "Oceania","PY": "South America","PE": "South America","PH": "Asia",
    "PN": "Oceania","PL": "Europe","PT": "Europe","PR": "North America","QA": "Asia","RE": "Africa",
    "RO": "Europe","RU": "Europe","RW": "Africa","BL": "North America","SH": "Africa","KN": "North America",
    "LC": "North America","MF": "North America","PM": "North America","VC": "North America","WS": "Oceania",
    "SM": "Europe","ST": "Africa","SA": "Asia","SN": "Africa","RS": "Europe","SC": "Africa","SL": "Africa",
    "SG": "Asia","SX": "North America","SK": "Europe","SI": "Europe","SB": "Oceania","SO": "Africa",
    "ZA": "Africa","SS": "Africa","ES": "Europe","LK": "Asia","SD": "Africa","SR": "South America",
    "SE": "Europe","CH": "Europe","SY": "Asia","TW": "Asia","TJ": "Asia","TZ": "Africa","TH": "Asia",
    "TL": "Asia","TG": "Africa","TK": "Oceania","TO": "Oceania","TT": "North America","TN": "Africa",
    "TR": "Asia","TM": "Asia","TC": "North America","TV": "Oceania","UG": "Africa","UA": "Europe",
    "AE": "Asia","GB": "Europe","US": "North America","UY": "South America","UZ": "Asia","VU": "Oceania",
    "VE": "South America","VN": "Asia","VI": "North America","WF": "Oceania","EH": "Africa","YE": "Asia",
    "ZM": "Africa","ZW": "Africa"
}

# ---------------------------
# Директории и GeoNames
# ---------------------------
def ensure_dirs():
    Path("public/data").mkdir(parents=True, exist_ok=True)

def backup_output():
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "rb") as src, open(BACKUP_FILE, "wb") as dst:
            dst.write(src.read())
        print(f"🗂 Бэкап старого JSON: {BACKUP_FILE}")

def download_geonames():
    if not os.path.exists(GEONAMES_FILE):
        import requests
        print("📥 Скачиваем GeoNames...")
        r = requests.get(GEONAMES_URL, timeout=TIMEOUT)
        r.raise_for_status()
        with open(GEONAMES_ZIP, "wb") as f:
            f.write(r.content)
        with zipfile.ZipFile(GEONAMES_ZIP, "r") as z:
            z.extractall(".")
        os.remove(GEONAMES_ZIP)
        print("✅ GeoNames распакован.")

def load_top_cities(limit=TOP_N) -> List[Dict[str, Any]]:
    cities = []
    with open(GEONAMES_FILE, "r", encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 15:
                continue
            try:
                population = int(p[14])
            except:
                population = 0
            cities.append({
                "geonameid": int(p[0]),
                "name": p[1],
                "lat": float(p[4]),
                "lon": float(p[5]),
                "country_iso2": p[8].upper(),
                "population": population,
                "region_code": p[10]
            })
    cities.sort(key=lambda x: x["population"], reverse=True)
    return cities[:limit]

# ---------------------------
# Асинхронный сбор данных
# ---------------------------
class DataCollector:
    def __init__(self):
        self.session = None
        self.iso2_to_iso3 = {}
        self.admin1_map = {}

    async def init_session(self):
        timeout = ClientTimeout(total=TIMEOUT)
        self.session = aiohttp.ClientSession(timeout=timeout)
        self.iso2_to_iso3 = await self.fetch_country_map()
        self.load_admin1_codes()

    async def close(self):
        if self.session:
            await self.session.close()

    def load_admin1_codes(self):
        if not os.path.exists(ADMIN1_FILE):
            import requests
            url = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
            r = requests.get(url, timeout=TIMEOUT)
            r.raise_for_status()
            with open(ADMIN1_FILE, "wb") as f:
                f.write(r.content)
        with open(ADMIN1_FILE, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) > 1:
                    self.admin1_map[parts[0]] = parts[1]

    async def fetch_country_map(self) -> Dict[str, Dict[str, str]]:
        url = "https://api.worldbank.org/v2/country?format=json&per_page=400"
        js = await self.fetch_json(url)
        mapping = {}
        if js and len(js) > 1:
            for row in js[1]:
                iso2 = row.get("iso2Code", "").upper()
                iso3 = row.get("id", "").upper()
                name = row.get("name", "")
                if iso2 and iso3:
                    mapping[iso2] = {"iso3": iso3, "name": name}
        return mapping

    async def fetch_wb_indicator(self, iso3: str, indicator: str) -> Optional[float]:
        url = f"https://api.worldbank.org/v2/country/{iso3}/indicator/{indicator}?format=json&per_page=100"
        js = await self.fetch_json(url)
        if js and len(js) > 1:
            data = [x for x in js[1] if x.get("value") is not None]
            if not data:
                return None
            data.sort(key=lambda x: int(x["date"]), reverse=True)
            return float(data[0]["value"])
        return None

    async def fetch_who(self, iso3: str, code: str) -> Optional[float]:
        url = f"https://ghoapi.azureedge.net/api/{code}?$filter=SpatialDim eq '{iso3}'&$orderby=TimeDim desc&$top=1"
        js = await self.fetch_json(url)
        if js:
            vals = js.get("value", [])
            if vals:
                v = vals[0].get("NumericValue")
                if v is not None:
                    return float(v)
        return None

    async def fetch_openaq(self, city_name: str) -> Dict[str, float]:
        url = f"https://api.openaq.org/v2/latest?city={city_name}&limit=100"
        js = await self.fetch_json(url)
        out = {}
        if js:
            for res in js.get("results", []):
                for m in res.get("measurements", []):
                    par = (m.get("parameter") or "").lower()
                    if par in ["pm25", "pm10", "no2", "o3", "so2"] and par not in out:
                        out[par] = m.get("value")
        return out

    async def fetch_meteo(self, lat: float, lon: float) -> Dict[str, float]:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&daily=temperature_2m_max,precipitation_sum&timezone=UTC"
        )
        js = await self.fetch_json(url)
        out = {}
        if js:
            temps = js.get("daily", {}).get("temperature_2m_max", [])
            precs = js.get("daily", {}).get("precipitation_sum", [])
            if temps:
                out["avg_temperature"] = round(sum(temps)/len(temps), 2)
            if precs:
                out["avg_precipitation"] = round(sum(precs), 2)
        return out

    async def fetch_osm_transport(self, lat: float, lon: float, radius_km=10) -> Dict[str, float]:
        return {}

    async def fetch_seismic_risk(self, lat: float, lon: float) -> Optional[float]:
        url = f"https://earthquake.usgs.gov/ws/designmaps/1.0/pgaview?lat={lat}&lon={lon}&probability=0.02&period=50"
        js = await self.fetch_json(url)
        if js:
            try:
                pga = js.get("pga")
                if pga is not None:
                    return float(pga)
            except:
                return None
        return None

    async def fetch_json(self, url: str) -> Optional[Any]:
        try:
            async with self.session.get(url) as r:
                if r.status != 200:
                    return None
                return await r.json()
        except:
            return None

    async def fetch_city_data(self, city: Dict[str, Any]) -> Dict[str, Any]:
        rec = {
            "geonameid": city["geonameid"],
            "name": city["name"],
            "country": city["country_iso2"],
            "lat": city["lat"],
            "lon": city["lon"],
            "population": city["population"],
            "country_name": self.iso2_to_iso3.get(city["country_iso2"], {}).get("name"),
            "continent": CONTINENT_MAP.get(city["country_iso2"])
        }

        admin1_code = city.get("region_code")
        rec["region_name"] = self.admin1_map.get(f"{city['country_iso2']}.{admin1_code}")

        iso2 = city["country_iso2"]
        iso3 = self.iso2_to_iso3.get(iso2, {}).get("iso3")

        tasks = [
            self.fetch_meteo(city["lat"], city["lon"]),
            self.fetch_openaq(city["name"]),
            self.fetch_seismic_risk(city["lat"], city["lon"])
        ]

        if iso3:
            for field, ind in WB_INDICATORS.items():
                tasks.append(self.fetch_wb_indicator(iso3, ind))
            for code in WHO_ENDPOINTS.values():
                tasks.append(self.fetch_who(iso3, code))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        idx = 0
        rec.update(results[idx]); idx +=1
        rec.update(results[idx]); idx +=1
        rec["seismic_risk"] = results[idx]; idx +=1

        if iso3:
            for field, ind in WB_INDICATORS.items():
                val = results[idx]; idx +=1
                if val is not None:
                    rec[field] = val
            for code in WHO_ENDPOINTS.keys():
                val = results[idx]; idx +=1
                if val is not None:
                    rec[code] = val

        rec = {k:v for k,v in rec.items() if v is not None}
        return rec

# ---------------------------
# Основной процесс
# ---------------------------
# ...весь твой текущий код до main_async() без изменений...

# ---------------------------
# Основной процесс
# ---------------------------
async def main_async():
    ensure_dirs()
    backup_output()
    download_geonames()
    cities = load_top_cities(TOP_N)

    collector = DataCollector()
    await collector.init_session()

    tasks = [collector.fetch_city_data(c) for c in cities]
    results = await asyncio.gather(*tasks)
    await collector.close()

    # Фильтруем только города, где есть все ключевые данные
    required_keys = [
        "avg_temperature", "avg_precipitation",
        "gdp_per_capita", "gni_per_capita",
        "unemployment_rate", "inflation_rate",
        "life_expectancy", "infant_mortality_rate",
        # "literacy_rate", 
        "tertiary_education_enrollment",
        "population_density", "pm25", "homicide_rate", "doctors_per_1000"
    ]
    filtered_results = [
        city for city in results
        if all(k in city and city[k] is not None for k in required_keys)
    ]

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(filtered_results, f, ensure_ascii=False, indent=2)

    print(f"✅ Готово. Из {len(results)} городов оставлено {len(filtered_results)} → {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(main_async())

