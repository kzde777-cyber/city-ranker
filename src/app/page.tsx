"use client";

import { useEffect, useState } from "react";

type FactorKey = "gdp_per_capita" | "life_expectancy" | "pm25" | "population_density";

interface City {
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
  gdp_per_capita: number | null;
  life_expectancy: number | null;
  pm25: number | null;
  population_density: number | null;
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

// Helper function to coerce a value to number or return null
function coerceToNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

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
  const [dataError, setDataError] = useState<string | null>(null);

  // Загрузка JSON с городами
  useEffect(() => {
    fetch("/data/cities.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch cities.json: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Validate that data is an array
        if (!Array.isArray(data)) {
          setDataError("Invalid data format: expected an array");
          console.error("Cities data is not an array:", data);
          return;
        }

        // Process and validate each city record
        const processedCities = data
          .map((raw: Record<string, unknown>, index: number) => {
            // Coerce numeric fields
            const city: City = {
              city: String(raw.name || raw.city || ""),
              country: String(raw.country_name || raw.country || ""),
              lat: coerceToNumber(raw.lat),
              lon: coerceToNumber(raw.lon),
              gdp_per_capita: coerceToNumber(raw.gdp_per_capita),
              life_expectancy: coerceToNumber(raw.life_expectancy),
              pm25: coerceToNumber(raw.pm25),
              population_density: coerceToNumber(raw.population_density),
            };

            // Log first city for debugging
            if (index === 0) {
              console.log("Sample city record (first row):", city);
            }

            return city;
          })
          .filter((city: City) => {
            // Filter out unusable records: must have city name, country, and at least one valid scoring field
            if (!city.city || !city.country) {
              return false;
            }
            // Must have at least one valid scoring field to be useful
            const hasValidField = 
              city.gdp_per_capita !== null ||
              city.life_expectancy !== null ||
              city.pm25 !== null ||
              city.population_density !== null;
            return hasValidField;
          });

        if (processedCities.length === 0) {
          setDataError("No usable city records found in data");
          console.warn("All city records were filtered out as unusable");
        } else {
          console.log(`Loaded ${processedCities.length} usable cities out of ${data.length} total records`);
        }

        setCities(processedCities);
      })
      .catch((err) => {
        setDataError(`Failed to load city data: ${err.message}`);
        console.error("Error loading cities:", err);
      });
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

  // Safe normalization with fallbacks
  const normalize = (val: number | null, min: number, max: number, invert = false) => {
    // If value is null/missing, return neutral score
    if (val === null) return 0.5;
    // If all values are the same (min === max), return neutral score
    if (max === min) return 0.5;
    // Check for invalid min/max
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0.5;
    
    const n = (val - min) / (max - min);
    // Ensure result is finite
    if (!Number.isFinite(n)) return 0.5;
    
    return invert ? 1 - n : n;
  };

  // вычисление итогового рейтинга города
  function computeScore(city: City): number {
    let score = 0;
    KEY_ORDER.forEach((key) => {
      // Only include cities with valid (non-null) values for this factor
      const validValues = cities
        .map((c) => c[key])
        .filter((v): v is number => v !== null);
      
      // Skip this factor if no valid values exist
      if (validValues.length === 0) {
        return;
      }
      
      const min = Math.min(...validValues);
      const max = Math.max(...validValues);
      const invert = key === "pm25" || key === "population_density";
      const norm = normalize(city[key], min, max, invert);
      
      // Only add to score if normalized value is valid
      if (Number.isFinite(norm)) {
        score += norm * weights[key];
      }
    });

    if (useDistance && origin && city.lat !== null && city.lon !== null) {
      const dist = haversine(origin.lat, origin.lon, city.lat, city.lon);
      const dNorm = normalize(dist, 0, maxDistance, true);
      if (Number.isFinite(dNorm)) {
        score += dNorm * distanceWeight;
      }
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
        const nextWeights: Record<FactorKey, number> = {
          gdp_per_capita: parts[0],
          life_expectancy: parts[1],
          pm25: parts[2],
          population_density: parts[3],
        };
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

      {dataError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h2 className="font-bold">Error Loading Data</h2>
          <p>{dataError}</p>
          <p className="mt-2 text-sm">
            Please check the browser console for more details, or verify that 
            public/data/cities.json exists and contains valid city records with 
            required fields (city/name, country, and at least one numeric factor).
          </p>
        </div>
      )}

      {!dataError && cities.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
          <p>Loading city data...</p>
        </div>
      )}

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

      {!dataError && cities.length > 0 && ranked.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
          <p>No cities match the current filter.</p>
        </div>
      )}

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
