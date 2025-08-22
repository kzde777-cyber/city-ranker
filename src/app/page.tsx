"use client";

import { useEffect, useState } from "react";

type FactorKey = "gdp_per_capita" | "life_expectancy" | "pm25" | "population_density";

interface City {
  city: string;
  country: string;
  lat: number;
  lon: number;
  gdp_per_capita: number;
  life_expectancy: number;
  pm25: number;
  population_density: number;
}

const FACTORS: Record<FactorKey, string> = {
  gdp_per_capita: "GDP per Capita",
  life_expectancy: "Life Expectancy",
  pm25: "Air Quality (PM2.5, lower is better)",
  population_density: "Population Density (lower is better)",
};

const KEY_ORDER: FactorKey[] = [
  "gdp_per_capita",
  "life_expectancy",
  "pm25",
  "population_density",
];

export default function Home() {
  const [cities, setCities] = useState<City[]>([]);
  const [weights, setWeights] = useState<Record<FactorKey, number>>({
    gdp_per_capita: 1,
    life_expectancy: 1,
    pm25: 1,
    population_density: 1,
  });
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [useDistance, setUseDistance] = useState(false);
  const [distanceWeight, setDistanceWeight] = useState(0);
  const [maxDistance, setMaxDistance] = useState(3000);
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);

  // Загрузка JSON с городами
  useEffect(() => {
    fetch("/data/cities.json")
      .then((res) => res.json())
      .then((data) => setCities(data));
  }, []);

  // все уникальные страны
  const countries = Array.from(new Set(cities.map((c) => c.country))).sort();

  // функция расчета расстояния по формуле хаверсин
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // нормализация
  const normalize = (val: number, min: number, max: number, invert = false) => {
    if (max === min) return 0.5;
    const n = (val - min) / (max - min);
    return invert ? 1 - n : n;
  };

  // вычисление итогового рейтинга города
  function computeScore(city: City): number {
    let score = 0;
    KEY_ORDER.forEach((key) => {
      const values = cities.map((c) => c[key]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const invert = key === "pm25" || key === "population_density";
      const norm = normalize(city[key], min, max, invert);
      score += norm * weights[key];
    });

    if (useDistance && origin) {
      const dist = haversine(origin.lat, origin.lon, city.lat, city.lon);
      const dNorm = normalize(dist, 0, maxDistance, true);
      score += dNorm * distanceWeight;
    }

    return score;
  }

  // загрузка параметров из URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("w")) {
      const parts = params
        .get("w")!
        .split(",")
        .map((n) => parseInt(n, 10));

      if (parts.length === KEY_ORDER.length && parts.every((n) => !Number.isNaN(n))) {
        const nextWeights: Record<FactorKey, number> = { ...weights };
        KEY_ORDER.forEach((k, i) => {
          nextWeights[k] = parts[i];
        });
        setWeights(nextWeights);
      }
    }

    if (params.get("d") === "1") {
      setUseDistance(true);
      const dw = parseInt(params.get("dw") || "0", 10);
      const dm = parseInt(params.get("dm") || "3000", 10);
      setDistanceWeight(dw);
      setMaxDistance(dm);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        });
      }
    }
  }, []);

  const filteredCities =
    selectedCountry === "all"
      ? cities
      : cities.filter((c) => c.country === selectedCountry);

  const ranked = filteredCities
    .map((c) => ({ ...c, score: computeScore(c) }))
    .sort((a, b) => b.score - a.score);

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">City Ranker</h1>

      <div className="mb-6 space-y-4">
        {KEY_ORDER.map((key) => (
          <div key={key} className="flex items-center space-x-2">
            <label className="w-64">{FACTORS[key]}</label>
            <input
              type="range"
              min={0}
              max={10}
              value={weights[key]}
              onChange={(e) =>
                setWeights({ ...weights, [key]: parseInt(e.target.value, 10) })
              }
            />
            <span>{weights[key]}</span>
          </div>
        ))}

        <div>
          <label className="mr-2">Filter by Country:</label>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="border rounded p-1"
          >
            <option value="all">All</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">City</th>
            <th className="border p-2">Country</th>
            <th className="border p-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.slice(0, 50).map((c, i) => (
            <tr key={i} className="odd:bg-gray-50">
              <td className="border p-2">{c.city}</td>
              <td className="border p-2">{c.country}</td>
              <td className="border p-2">{c.score.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
