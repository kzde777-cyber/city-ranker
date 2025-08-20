"use client";

import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Типы — явно объявляем допустимые ключи факторов,
 * чтобы TypeScript понимал индексацию city.factors[f.key]
 */
type FactorKey = "safety" | "cost" | "salary" | "pollution" | "transport";

type Factors = Record<FactorKey, number>;

interface City {
  name: string;
  factors: Factors;
}

/** Пример данных — можно перенести в src/data/cities.json позже */
const cities: City[] = [
  {
    name: "Berlin",
    factors: {
      safety: 60,
      cost: 55,
      salary: 70,
      pollution: 40,
      transport: 75,
    },
  },
  {
    name: "Prague",
    factors: {
      safety: 70,
      cost: 65,
      salary: 55,
      pollution: 50,
      transport: 60,
    },
  },
  {
    name: "Tokyo",
    factors: {
      safety: 85,
      cost: 40,
      salary: 80,
      pollution: 45,
      transport: 90,
    },
  },
];

const factorsList: { key: FactorKey; label: string }[] = [
  { key: "safety", label: "Safety" },
  { key: "cost", label: "Cost of Living" },
  { key: "salary", label: "Salary" },
  { key: "pollution", label: "Pollution" },
  { key: "transport", label: "Transport" },
];

export default function Home() {
  const [weights, setWeights] = useState<Record<FactorKey, number>>({
    safety: 20,
    cost: 20,
    salary: 20,
    pollution: 20,
    transport: 20,
  });

  const [results, setResults] = useState<Array<City & { score: string }>>([]);

  const calculateRanking = () => {
    const scored = cities.map((city) => {
      let score = 0;
      factorsList.forEach((f) => {
        const factorValue = city.factors[f.key] ?? 0;
        const weight = weights[f.key] ?? 0;
        score += factorValue * (weight / 100);
      });
      return { ...city, score: score.toFixed(1) };
    });

    scored.sort((a, b) => Number(b.score) - Number(a.score));
    setResults(scored);
  };

  const updateWeight = (key: FactorKey, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">🌍 City Finder MVP</h1>
      <p className="mb-6 text-gray-600">
        Choose what matters most to you and find the best cities.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4 space-y-4">
            <h2 className="text-xl font-semibold mb-2">Set Your Preferences</h2>
            {factorsList.map((f) => (
              <div key={f.key} className="mb-4">
                <div className="flex justify-between mb-1">
                  <span>{f.label}</span>
                  <span>{weights[f.key]}%</span>
                </div>
                <Slider
                  value={[weights[f.key]]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(val: number[]) => updateWeight(f.key, val[0])}
                />
              </div>
            ))}

            <Button onClick={calculateRanking} className="mt-4 w-full">
              Show Results
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold mb-2">Results</h2>
            {results.length === 0 ? (
              <p className="text-gray-500">No results yet. Adjust weights and click the button.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="border-b p-2">City</th>
                    <th className="border-b p-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((city) => (
                    <tr key={city.name}>
                      <td className="border-b p-2">{city.name}</td>
                      <td className="border-b p-2">{city.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
