"use client";

import { useEffect, useState } from "react";

interface City {
  city: string;
  country: string;
  continent: string;
  lat: number;
  lon: number;
  population: number;
  gdp_per_capita: number;
  gni_per_capita: number;
  unemployment_rate: number;
  inflation_rate: number;
  life_expectancy: number;
  infant_mortality_rate: number;
  // literacy_rate: number;
  tertiary_education_enrollment: number;
  population_density: number;
  pm25: number;
  homicide_rate: number;
  doctors_per_1000: number;
  avg_temperature: number;
  avg_precipitation: number;
  income_index: number;
  cost_index: number;
}

type FactorKey = keyof Omit<
  City,
  "city" | "country" | "continent" | "lat" | "lon"
>;

const audienceProfiles: Record<
  string,
  { label: string; factors: FactorKey[]; presets: Record<string, number> }
> = {
  all: {
    label: "All",
    factors: [
      "population_density",
      "pm25",
      "homicide_rate",
      "life_expectancy",
      "doctors_per_1000",
      "infant_mortality_rate",
      "avg_temperature",
      "avg_precipitation",
      "gdp_per_capita",
      "gni_per_capita",
      "unemployment_rate",
      "inflation_rate",
      "tertiary_education_enrollment",
      "income_index",
      "cost_index",
    ],
    presets: {
      population_density: 5,
      pm25: 7,
      homicide_rate: 8,
      life_expectancy: 8,
      doctors_per_1000: 7,
      infant_mortality_rate: 6,
      avg_temperature: 5,
      avg_precipitation: 4,
      gdp_per_capita: 4,
      gni_per_capita: 3,
      unemployment_rate: 6,
      inflation_rate: 5,
      tertiary_education_enrollment: 6,
      income_index: 5,
      cost_index: 5,
    },
  },
  living: {
    label: "Life",
    factors: [
      "population_density",
      "pm25",
      "homicide_rate",
      "life_expectancy",
      "doctors_per_1000",
      "infant_mortality_rate",
      "avg_temperature",
      "avg_precipitation",
      "income_index",
      "cost_index",
    ],
    presets: {
      population_density: 5,
      pm25: 7,
      homicide_rate: 8,
      life_expectancy: 8,
      doctors_per_1000: 7,
      infant_mortality_rate: 6,
      avg_temperature: 5,
      avg_precipitation: 4,
      income_index: 6,
      cost_index: 5,
    },
  },
  business: {
    label: "Business",
    factors: [
      "gdp_per_capita",
      "gni_per_capita",
      "unemployment_rate",
      "inflation_rate",
      "population_density",
      //"literacy_rate",
      "tertiary_education_enrollment",
      "income_index",
      "cost_index",
    ],
    presets: {
      gdp_per_capita: 8,
      gni_per_capita: 7,
      unemployment_rate: 6,
      inflation_rate: 5,
      population_density: 5,
      //literacy_rate: 7,
      tertiary_education_enrollment: 6,
      income_index: 7,
      cost_index: 5,
    },
  },
  tourism: {
    label: "Tourism",
    factors: [
      "avg_temperature",
      "avg_precipitation",
      "homicide_rate",
      "pm25",
      "population_density",
      "income_index",
      "cost_index",
    ],
    presets: {
      avg_temperature: 7,
      avg_precipitation: 6,
      homicide_rate: 8,
      pm25: 6,
      population_density: 5,
      income_index: 5,
      cost_index: 6,
    },
  },
};

export default function Home() {
  const [cities, setCities] = useState<City[]>([]);
  const [weights, setWeights] = useState<Record<FactorKey, number>>({});
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryInput, setCountryInput] = useState("");
  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [audience, setAudience] = useState<"living" | "business" | "tourism">(
    "living"
  );

  useEffect(() => {
    fetch("/data/cities.json")
      .then((res) => res.json())
      .then((data) => {
        console.log("Cities loaded:", data.length);
        const formatted: City[] = data.map((c: any) => ({
          city: c.name || "Unknown",
          country: c.country_name,
          continent: c.continent,
          lat: c.lat,
          lon: c.lon,
          population: c.population ?? 0,
          gdp_per_capita: c.gdp_per_capita ?? 0,
          gni_per_capita: c.gni_per_capita ?? 0,
          unemployment_rate: c.unemployment_rate ?? 0,
          inflation_rate: c.inflation_rate ?? 0,
          life_expectancy: c.life_expectancy ?? 0,
          infant_mortality_rate: c.infant_mortality_rate ?? 0,
          //literacy_rate: c.literacy_rate ?? 0,
          tertiary_education_enrollment: c.tertiary_education_enrollment ?? 0,
          population_density: c.population_density ?? 0,
          pm25: c.pm25 ?? 0,
          homicide_rate: c.homicide_rate ?? 0,
          doctors_per_1000: c.doctors_per_1000 ?? 0,
          avg_temperature: c.avg_temperature ?? 0,
          avg_precipitation: c.avg_precipitation ?? 0,
        }));
        setCities(formatted);

        if (formatted.length > 0) {
          const keys = Object.keys(formatted[0]).filter(
            (k) =>
              !["city", "country", "continent", "lat", "lon"].includes(k)
          ) as FactorKey[];
          const initialWeights: Record<FactorKey, number> = {};
          keys.forEach((k) => (initialWeights[k] = 1));
          setWeights(initialWeights);
        }
      });
  }, []);

  useEffect(() => {
    setWeights((prev) => ({
      ...prev,
      ...audienceProfiles[audience].presets,
    }));
  }, [audience]);

  const allCountries = Array.from(new Set(cities.map((c) => c.country))).sort();
  const allContinents = Array.from(new Set(cities.map((c) => c.continent))).sort();

  function normalize(val: number, min: number, max: number, invert = false) {
    if (min === max) return 0.5;
    const n = (val - min) / (max - min);
    return invert ? 1 - n : n;
  }

  function computeScore(city: City): number {
    let score = 0;
    audienceProfiles[audience].factors.forEach((k) => {
      const values = cities
        .map((c) => c[k] ?? 0)
        .filter((v) => typeof v === "number" && !isNaN(v));

      if (values.length === 0) return;

      const min = Math.min(...values);
      const max = Math.max(...values);

      const invert =
        k === "pm25" ||
        k === "population_density" ||
        k === "infant_mortality_rate" ||
        k === "unemployment_rate" ||
        k === "inflation_rate" ||
        k === "homicide_rate";

      const val = city[k] ?? 0;
      score += normalize(val, min, max, invert) * (weights[k] ?? 0);
    });
    return score;
  }

  const filteredCities = cities.filter((c) => {
    const countryMatch =
      selectedCountries.length === 0 || selectedCountries.includes(c.country);
    const continentMatch =
      selectedContinents.length === 0 || selectedContinents.includes(c.continent);
    return countryMatch && continentMatch;
  });

  const ranked = filteredCities
    .map((c) => ({ ...c, score: computeScore(c) }))
    .sort((a, b) => b.score - a.score);

  const countrySuggestions = allCountries.filter((c) =>
    c.toLowerCase().includes(countryInput.toLowerCase())
  );

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    );
  };

  const toggleContinent = (continent: string) => {
    setSelectedContinents((prev) =>
      prev.includes(continent)
        ? prev.filter((c) => c !== continent)
        : [...prev, continent]
    );
  };

  return (
    <main className="min-h-screen relative font-sans">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-50 -z-10"
        style={{ backgroundImage: 'url("/images/relocation-bg.jpg")' }}
      />

      <section className="text-center py-16 px-4">
        <h1 className="text-5xl font-bold text-gray-900 drop-shadow-lg tracking-wide font-serif">
          🌏 Global City Ranker
        </h1>
        <p className="text-lg text-gray-100 max-w-3xl mx-auto mt-4 drop-shadow-md font-sans bg-black/10 inline-block px-4 py-2 rounded-lg">
          Discover the best cities worldwide for living and relocation. All data is sourced exclusively from official and reliable sources, including economic, social, and environmental indicators. Customize rankings according to your personal priorities and make informed decisions for your next move!
        </p>
      </section>

      <div className="flex justify-center gap-4 mb-8">
        {Object.entries(audienceProfiles).map(([key, profile]) => (
          <button
            key={key}
            onClick={() => setAudience(key as any)}
            className={`px-6 py-2 rounded-full border font-medium transition ${
              audience === key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-gray-100 hover:bg-gray-200 border-gray-300"
            }`}
          >
            {profile.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12 px-4">
        <div className="col-span-1 bg-white/10 backdrop-blur-2xl rounded-3xl shadow-xl p-6 hover:shadow-2xl transition">
          <h2 className="text-2xl font-semibold text-blue-800 mb-4 font-serif">
            ⚖️ Factors & Weights ({audienceProfiles[audience].label})
          </h2>
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {audienceProfiles[audience].factors.map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">
                    {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                  <span>{weights[key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights({ ...weights, [key]: Number(e.target.value) })
                  }
                  className="w-full accent-blue-600"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-white/10 backdrop-blur-2xl rounded-3xl shadow-xl p-6 hover:shadow-2xl transition">
          <h2 className="text-2xl font-semibold text-blue-800 mb-4 font-serif">
            🌐 Filters
          </h2>

          <div className="mb-6">
            <p className="font-medium mb-2 font-mono">Continents</p>
            <div className="flex flex-wrap gap-2">
              {allContinents.map((c) => (
                <span
                  key={c}
                  onClick={() => toggleContinent(c)}
                  className={`px-3 py-1 rounded-full cursor-pointer text-sm border transition ${
                    selectedContinents.includes(c)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="font-medium mb-2 font-mono">Countries</p>
            <input
              placeholder="Countries filter..."
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value)}
              className="border rounded-xl w-full px-4 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="max-h-48 overflow-y-auto border rounded-xl p-2 space-y-1">
              {countrySuggestions.map((c) => (
                <label
                  key={c}
                  className="flex items-center space-x-2 cursor-pointer text-sm hover:bg-gray-100 rounded-md p-1 transition"
                >
                  <input
                    type="checkbox"
                    checked={selectedCountries.includes(c)}
                    onChange={() => toggleCountry(c)}
                    className="accent-blue-600"
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-2xl rounded-3xl shadow-xl p-6 hover:shadow-2xl transition mb-12 px-4">
        <h2 className="text-2xl font-semibold text-blue-800 mb-4 font-serif">
          🏙️ Top Cities ({audienceProfiles[audience].label})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm table-fixed">
            <thead className="bg-blue-50 bg-opacity-50 sticky top-0">
              <tr>
                <th className="p-2 text-left font-medium text-gray-700 w-1/5">
                  City
                </th>
                <th className="p-2 text-left font-medium text-gray-700 w-1/5">
                  Country
                </th>
                <th className="p-2 text-left font-medium text-gray-700 w-3/5">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, i) => (
                <tr
                  key={i}
                  className="odd:bg-gray-50/50 hover:bg-gray-100/50 transition"
                >
                  <td className="p-2 font-medium">{c.city}</td>
                  <td className="p-2">{c.country}</td>
                  <td className="p-2">
                    <div className="w-full bg-gray-300 rounded-full h-3 mb-1 overflow-hidden">
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all"
                        style={{ width: `${Math.min(c.score * 10, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-800">
                      {c.score.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
