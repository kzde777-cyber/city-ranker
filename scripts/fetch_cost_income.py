#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
City Income & Cost (Open Sources) — baseline data pipeline

Функции:
- Берёт список крупных городов мира из Wikidata SPARQL (батчами с retry)
- Подтягивает данные по доходам на душу населения из World Bank (GNI per capita PPP / USD)
- Строит индекс доходов
- Сохраняет CSV в папке data/ проекта

Запуск:
    python scripts/fetch_cost_income.py --limit 300
"""

import argparse
import os
import time
import requests
import pandas as pd

WB_API = "https://api.worldbank.org/v2"

# --- Wikidata: города батчами ---
def fetch_wikidata_cities(limit=300, min_population=1000000, batch_size=50, max_retries=5):
    url = "https://query.wikidata.org/sparql"
    headers = {"User-Agent": "CityRankerBot/1.0 (https://example.com)"}

    results = []
    offset = 0

    while offset < limit:
        batch_limit = min(batch_size, limit - offset)
        query = f"""
        SELECT ?city ?cityLabel ?countryLabel ?iso2 ?population ?lat ?lon WHERE {{
          ?city wdt:P31/wdt:P279* wd:Q515 .
          ?city wdt:P1082 ?population .
          ?city wdt:P17 ?country .
          ?country wdt:P297 ?iso2 .
          OPTIONAL {{ ?city wdt:P625 ?coord .
                     BIND(geof:latitude(?coord) AS ?lat) .
                     BIND(geof:longitude(?coord) AS ?lon) . }}
          FILTER(?population > {min_population})
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        ORDER BY DESC(?population)
        LIMIT {batch_limit} OFFSET {offset}
        """

        success = False
        for attempt in range(max_retries):
            try:
                print(f"Fetching cities {offset+1}..{offset+batch_limit} (attempt {attempt+1})...")
                r = requests.get(url, params={"query": query, "format": "json"},
                                 headers=headers, timeout=180)
                r.raise_for_status()
                data = r.json()
                batch = []
                for item in data["results"]["bindings"]:
                    batch.append({
                        "city": item["cityLabel"]["value"],
                        "country": item["countryLabel"]["value"],
                        "iso2": item.get("iso2", {}).get("value"),
                        "population": int(float(item["population"]["value"])),
                        "lat": float(item.get("lat", {}).get("value", 0)),
                        "lon": float(item.get("lon", {}).get("value", 0)),
                    })
                results.extend(batch)
                success = True
                break
            except Exception as e:
                print(f"⚠️ Error fetching batch (offset {offset}): {e}")
                time.sleep(5)

        if not success:
            print(f"❌ Failed to fetch cities for offset {offset}, skipping...")

        offset += batch_limit

    print(f"✅ Total cities fetched: {len(results)}")
    return pd.DataFrame(results)


# --- World Bank: доходы ---
def wb_indicator_latest(iso2: str, indicator: str):
    url = f"{WB_API}/country/{iso2}/indicator/{indicator}"
    params = {"format":"json","per_page":60}
    r = requests.get(url, params=params, timeout=60)
    if r.status_code != 200:
        return None
    try:
        js = r.json()
        if not isinstance(js, list) or len(js)<2: return None
        entries = js[1] or []
        entries = sorted(entries, key=lambda x:x.get("date","0"), reverse=True)
        for e in entries:
            val = e.get("value")
            if val is not None:
                return (int(e.get("date")), float(val))
        return None
    except: return None

def fetch_wb_income(iso2_list):
    rows=[]
    for iso2 in sorted(set([i.upper() for i in iso2_list if i])):
        gni_ppp = wb_indicator_latest(iso2,"NY.GNP.PCAP.PP.CD")
        gni_usd = wb_indicator_latest(iso2,"NY.GNP.PCAP.CD")
        rows.append({
            "iso2":iso2,
            "gni_ppp_year": gni_ppp[0] if gni_ppp else None,
            "gni_ppp": gni_ppp[1] if gni_ppp else None,
            "gni_usd_year": gni_usd[0] if gni_usd else None,
            "gni_usd": gni_usd[1] if gni_usd else None
        })
    return pd.DataFrame(rows)

def build_income_index(cities, wb):
    df = cities.merge(wb,on="iso2",how="left")
    med = df["gni_ppp"].median(skipna=True)
    df["income_index"] = df["gni_ppp"]/med
    return df

# --- Main ---
def main():
    parser = argparse.ArgumentParser(description="Fetch cities cost & income indices (open sources).")
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--min-pop", type=int, default=1000000)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()

    # Абсолютный путь к папке data в проекте
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    if args.out is None:
        out_path = os.path.join(data_dir, "cities_cost_income.csv")
    else:
        out_path = os.path.join(data_dir, os.path.basename(args.out))

    print(f"📂 CSV будет сохранён в: {out_path}")

    cities = fetch_wikidata_cities(limit=args.limit, min_population=args.min_pop)
    wb = fetch_wb_income(cities["iso2"].dropna().unique().tolist())
    out = build_income_index(cities, wb)
    out.to_csv(out_path, index=False, encoding="utf-8")
    print(f"✅ Done. Saved to {out_path}")


if __name__=="__main__":
    main()
