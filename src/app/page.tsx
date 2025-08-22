"use client";

import { useEffect, useMemo, useState } from "react";

type City = {
  geonameid: number;
  name: string;
  country: string;
  country_name: string;
  lat: number;
  lon: number;
  population: number;
  gdp_per_capita?: number;   // выше — лучше
  life_expectancy?: number;  // выше — лучше
  pm25?: number;             // ниже — лучше
};

type FactorKey = "gdp_per_capita" | "life_expectancy" | "pm25";
const KEY_ORDER: FactorKey[] = ["gdp_per_capita", "life_expectancy", "pm25"];

const FACTORS: Record<
  FactorKey,
  { label: string; higherIsBetter: boolean; format?: (v: number) => string }
> = {
  gdp_per_capita: {
    label: "GDP per capita (USD)",
    higherIsBetter: true,
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  life_expectancy: {
    label: "Life expectancy (years)",
    higherIsBetter: true,
    format: (v) => v.toFixed(1),
  },
  pm25: {
    label: "PM2.5 (μg/m³, lower is better)",
    higherIsBetter: false,
    format: (v) => v.toFixed(1),
  },
};

// Хаверсин
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Нормализация в 0–100
function normalize(
  value: number | undefined,
  min: number,
  max: number,
  higherIsBetter: boolean
) {
  if (value == null || Number.isNaN(value) || max === min) return 50;
  const x = (value - min) / (max - min);
  const z = Math.min(1, Math.max(0, x));
  return Math.round((higherIsBetter ? z : 1 - z) * 100);
}

export default function HomePage() {
  const [all, setAll] = useState<City[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("All");

  const [weights, setWeights] = useState<Record<FactorKey, number>>({
    gdp_per_capita: 40,
    life_expectancy: 40,
    pm25: 20,
  });

  const [useDistance, setUseDistance] = useState(false);
  const [distanceWeight, setDistanceWeight] = useState(0);
  const [distanceMaxKm, setDistanceMaxKm] = useState(3000);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);

  // Загрузка данных
  useEffect(() => {
    fetch("/cities.json")
      .then((r) => r.json())
      .then((data: City[]) => {
        setAll(data);
        const unique = Array.from(
          new Set(data.map((c) => c.country_name).filter(Boolean))
        ).sort();
        setCountries(unique);
      });
  }, []);

  // Подхват конфига из URL (?c=...&w=40,40,20&d=1&dw=50&dm=3000)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) setSelectedCountry(c);

    const w = params.get("w");
    if (w) {
      const parts = w.split(",").map((n) => parseInt(n, 10));
      if (parts.length === KEY_ORDER.length && parts.every((n) => !Number.isNaN(n))) {
        setWeights({
          [KEY_ORDER[0]]: parts[0],
          [KEY_ORDER[1]]: parts[1],
          [KEY_ORDER[2]]: parts[2],
        });
      }
    }

    if (params.get("d") === "1") {
      setUseDistance(true);
      const dw = parseInt(params.get("dw") || "0", 10);
      const dm = parseInt(params.get("dm") || "3000", 10);
      if (!Number.isNaN(dw)) setDistanceWeight(dw);
      if (!Number.isNaN(dm)) setDistanceMaxKm(dm);
    }
  }, []);

  // Запрос геолокации при включении «учитывать расстояние»
  useEffect(() => {
    if (useDistance && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setUserLoc(null),
        { enableHighAccuracy: false, timeout: 8000 }
      );
    }
  }, [useDistance]);

  // Диапазоны факторов для нормализации (по всему датасету)
  const ranges = useMemo(() => {
    const obj: Record<FactorKey, { min: number; max: number }> = {
      gdp_per_capita: { min: Infinity, max: -Infinity },
      life_expectancy: { min: Infinity, max: -Infinity },
      pm25: { min: Infinity, max: -Infinity },
    };
    for (const c of all) {
      (Object.keys(FACTORS) as FactorKey[]).forEach((k) => {
        const v = c[k];
        if (v != null && !Number.isNaN(v)) {
          obj[k].min = Math.min(obj[k].min, v);
          obj[k].max = Math.max(obj[k].max, v);
        }
      });
    }
    (Object.keys(obj) as FactorKey[]).forEach((k) => {
      if (!Number.isFinite(obj[k].min) || !Number.isFinite(obj[k].max)) {
        obj[k] = { min: 0, max: 1 };
      }
    });
    return obj;
  }, [all]);

  // Счёт + сортировка
  const scored = useMemo(() => {
    const base =
      selectedCountry === "All"
        ? all.slice()
        : all.filter((c) => c.country_name === selectedCountry);

    const withDistance = base.map((c) => {
      let distanceKm: number | undefined;
      let distanceScore: number | undefined;
      if (useDistance && userLoc) {
        distanceKm = haversineKm(userLoc.lat, userLoc.lon, c.lat, c.lon);
        const clipped = Math.min(distanceKm, distanceMaxKm);
        distanceScore = Math.round(100 * (1 - clipped / distanceMaxKm));
      }
      return { ...c, distanceKm, distanceScore };
    });

    return withDistance
      .map((c) => {
        let sum = 0;
        let wsum = 0;
        (Object.keys(FACTORS) as FactorKey[]).forEach((k) => {
          const w = Math.max(0, Math.min(100, weights[k] ?? 0));
          if (w === 0) return;
          const { min, max } = ranges[k];
          const norm = normalize(c[k], min, max, FACTORS[k].higherIsBetter);
          sum += norm * w;
          wsum += w;
        });
        if (useDistance && distanceWeight > 0 && c.distanceScore != null) {
          sum += c.distanceScore * distanceWeight;
          wsum += distanceWeight;
        }
        const score = wsum > 0 ? sum / wsum : 0;
        return { ...c, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [
    all,
    selectedCountry,
    weights,
    ranges,
    useDistance,
    userLoc,
    distanceWeight,
    distanceMaxKm,
  ]);

  // Сборка шаримой ссылки (без cookies)
  function buildShareURL() {
    const params = new URLSearchParams();
    if (selectedCountry !== "All") params.set("c", selectedCountry);
    const w = KEY_ORDER.map((k) => weights[k] ?? 0).join(",");
    params.set("w", w);
    if (useDistance) {
      params.set("d", "1");
      params.set("dw", String(distanceWeight));
      params.set("dm", String(distanceMaxKm));
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  async function copyShareURL() {
    const url = buildShareURL();
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">🌍 CityRanker — Multi-factor ranking</h1>
        <a href="/about" className="text-sm underline">About</a>
      </div>

      {/* Панель управления */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Страна */}
        <div className="border rounded-2xl p-4">
          <label className="block text-sm font-medium mb-2">Filter by country</label>
          <select
            className="border rounded-lg px-3 py-2 w-full"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="All">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Веса факторов */}
        <div className="border rounded-2xl p-4 md:col-span-2">
          <p className="text-sm font-medium mb-3">Factor weights (0% = ignore)</p>
          <div className="space-y-3">
            {(Object.keys(FACTORS) as FactorKey[]).map((k) => (
              <div key={k} className="flex items-center gap-3">
                <div className="w-56 shrink-0">
                  <span className="text-sm">{FACTORS[k].label}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weights[k]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [k]: Number(e.target.value) }))
                  }
                  className="w-full"
                />
                <span className="w-12 text-right text-sm">{weights[k]}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Расстояние */}
        <div className="border rounded-2xl p-4 md:col-span-3">
          <div className="flex items-center gap-3 mb-3">
            <input
              id="useDistance"
              type="checkbox"
              checked={useDistance}
              onChange={(e) => setUseDistance(e.target.checked)}
            />
            <label htmlFor="useDistance" className="font-medium">
              Prioritize distance from my current location
            </label>
            <button
              onClick={copyShareURL}
              className="ml-auto border rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50"
              title="Copy a link with current settings"
            >
              Share
            </button>
          </div>

          <div className={`grid sm:grid-cols-2 gap-4 ${useDistance ? "" : "opacity-50 pointer-events-none"}`}>
            <div className="flex items-center gap-3">
              <div className="w-56 shrink-0">
                <span className="text-sm">Distance weight</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={distanceWeight}
                onChange={(e) => setDistanceWeight(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-12 text-right text-sm">{distanceWeight}%</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-56 shrink-0">
                <span className="text-sm">Max preferred distance (km)</span>
              </div>
              <input
                type="range"
                min={500}
                max={10000}
                step={100}
                value={distanceMaxKm}
                onChange={(e) => setDistanceMaxKm(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-20 text-right text-sm">{distanceMaxKm} km</span>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded-2xl overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left">City</th>
              <th className="px-3 py-2 text-left">Country</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">GDP pc</th>
              <th className="px-3 py-2 text-right">Life exp.</th>
              <th className="px-3 py-2 text-right">PM2.5</th>
              {useDistance && <th className="px-3 py-2 text-right">Distance</th>}
            </tr>
          </thead>
          <tbody>
            {scored.map((c) => {
              const nGdp = normalize(c.gdp_per_capita, ranges.gdp_per_capita.min, ranges.gdp_per_capita.max, true);
              const nLife = normalize(c.life_expectancy, ranges.life_expectancy.min, ranges.life_expectancy.max, true);
              const nAir = normalize(c.pm25, ranges.pm25.min, ranges.pm25.max, false);
              return (
                <tr key={c.geonameid} className="border-t">
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.country_name}</td>
                  <td className="px-3 py-2 text-right font-medium">{c.score ? c.score.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {c.gdp_per_capita != null ? `$${Math.round(c.gdp_per_capita).toLocaleString()}` : "—"}
                    <span className="text-gray-400 ml-2">({nGdp})</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.life_expectancy != null ? c.life_expectancy.toFixed(1) : "—"}
                    <span className="text-gray-400 ml-2">({nLife})</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.pm25 != null ? c.pm25.toFixed(1) : "—"}
                    <span className="text-gray-400 ml-2">({nAir})</span>
                  </td>
                  {useDistance && (
                    <td className="px-3 py-2 text-right">
                      {c["distanceKm"] != null ? Math.round(c["distanceKm"]).toLocaleString() + " km" : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
