'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Filter, RefreshCw, Zap, MapPin, Users, DollarSign, Shield, Heart,
  GraduationCap, Plus, Check, Sparkles, Wand2
} from 'lucide-react';

/** ======================
 *  Типы и данные профилей
 *  ====================== */
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

type FactorKey = keyof Omit<City, 'city' | 'country' | 'continent' | 'lat' | 'lon'>;

const audienceProfiles: Record<
  'all' | 'living' | 'business' | 'tourism',
  { label: string; factors: FactorKey[]; presets: Record<string, number> }
> = {
  all: {
    label: 'All',
    factors: [
      'population_density','pm25','homicide_rate','life_expectancy','doctors_per_1000','infant_mortality_rate',
      'avg_temperature','avg_precipitation','gdp_per_capita','gni_per_capita','unemployment_rate','inflation_rate',
      'tertiary_education_enrollment','income_index','cost_index'
    ],
    presets: {
      population_density: 5, pm25: 7, homicide_rate: 8, life_expectancy: 8, doctors_per_1000: 7, infant_mortality_rate: 6,
      avg_temperature: 5, avg_precipitation: 4, gdp_per_capita: 4, gni_per_capita: 3, unemployment_rate: 6, inflation_rate: 5,
      tertiary_education_enrollment: 6, income_index: 5, cost_index: 5
    }
  },
  living: {
    label: 'Life',
    factors: [
      'population_density','pm25','homicide_rate','life_expectancy','doctors_per_1000','infant_mortality_rate',
      'avg_temperature','avg_precipitation','income_index','cost_index'
    ],
    presets: {
      population_density: 5, pm25: 7, homicide_rate: 8, life_expectancy: 8, doctors_per_1000: 7, infant_mortality_rate: 6,
      avg_temperature: 5, avg_precipitation: 4, income_index: 6, cost_index: 5
    }
  },
  business: {
    label: 'Business',
    factors: [
      'gdp_per_capita','gni_per_capita','unemployment_rate','inflation_rate','population_density',
      'tertiary_education_enrollment','income_index','cost_index'
    ],
    presets: {
      gdp_per_capita: 8, gni_per_capita: 7, unemployment_rate: 6, inflation_rate: 5, population_density: 5,
      tertiary_education_enrollment: 6, income_index: 7, cost_index: 5
    }
  },
  tourism: {
    label: 'Tourism',
    factors: ['avg_temperature','avg_precipitation','homicide_rate','pm25','population_density','income_index','cost_index'],
    presets: {
      avg_temperature: 7, avg_precipitation: 6, homicide_rate: 8, pm25: 6, population_density: 5, income_index: 5, cost_index: 6
    }
  }
};

/** ==============
 *  UI мини-компоненты (без shadcn/ui)
 *  ============== */
function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}
function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pt-5">{children}</div>;
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-bold text-slate-800">{children}</h3>;
}
function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}
function ButtonBase({
  children, onClick, disabled, className = '', type = 'button'
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type as any}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium transition
        disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}
function Slider({
  value, min = 0, max = 10, step = 1, onChange
}: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-blue-600"
    />
  );
}

/** ==============
 *  Вспомогательные функции
 *  ============== */
function getScoreGradient(score: number) {
  if (score >= 80) return 'from-emerald-500 to-teal-500';
  if (score >= 65) return 'from-blue-500 to-indigo-500';
  if (score >= 50) return 'from-yellow-500 to-orange-500';
  return 'from-orange-500 to-red-500';
}
function normalize(val: number, min: number, max: number, invert = false) {
  if (min === max) return 0.5;
  const n = (val - min) / (max - min);
  return invert ? 1 - n : n;
}

/** ==============
 *  Главная страница
 *  ============== */
export default function Home() {
  const [cities, setCities] = useState<City[]>([]);
  const [weights, setWeights] = useState<Record<FactorKey, number>>({} as any);
  const [audience, setAudience] = useState<'living' | 'business' | 'tourism' | 'all'>('living');

  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryInput, setCountryInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Загрузка данных
  useEffect(() => {
    let isMounted = true;
    fetch('/data/cities.json')
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        const formatted: City[] = data.map((c: any) => ({
          city: c.name || 'Unknown',
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
          tertiary_education_enrollment: c.tertiary_education_enrollment ?? 0,
          population_density: c.population_density ?? 0,
          pm25: c.pm25 ?? 0,
          homicide_rate: c.homicide_rate ?? 0,
          doctors_per_1000: c.doctors_per_1000 ?? 0,
          avg_temperature: c.avg_temperature ?? 0,
          avg_precipitation: c.avg_precipitation ?? 0,
          income_index: c.income_index ?? 0,
          cost_index: c.cost_index ?? 0
        }));
        setCities(formatted);

        // базовые веса = 1
        if (formatted.length > 0) {
          const keys = Object.keys(formatted[0]).filter(
            (k) => !['city', 'country', 'continent', 'lat', 'lon'].includes(k)
          ) as FactorKey[];
          const initial: Record<FactorKey, number> = {} as any;
          keys.forEach((k) => (initial[k] = 1));
          setWeights(initial);
        }
      });
    return () => { isMounted = false; };
  }, []);

  // Применяем пресеты при смене audience
  useEffect(() => {
    setWeights((prev) => ({ ...prev, ...audienceProfiles[audience].presets } as any));
  }, [audience]);

  const allCountries = useMemo(
    () => Array.from(new Set(cities.map((c) => c.country))).sort(),
    [cities]
  );
  const allContinents = useMemo(
    () => Array.from(new Set(cities.map((c) => c.continent))).sort(),
    [cities]
  );

  const filteredCountries = useMemo(
    () => allCountries.filter((c) => c.toLowerCase().includes(countryInput.toLowerCase())),
    [allCountries, countryInput]
  );

  // Счёт
  const computeScore = (city: City) => {
    let score = 0;
    audienceProfiles[audience].factors.forEach((k) => {
      const values = cities.map((c) => (c[k] ?? 0)).filter((v) => typeof v === 'number' && !isNaN(v));
      if (!values.length) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const invert =
        k === 'pm25' ||
        k === 'population_density' ||
        k === 'infant_mortality_rate' ||
        k === 'unemployment_rate' ||
        k === 'inflation_rate' ||
        k === 'homicide_rate';
      const val = city[k] ?? 0;
      score += normalize(val, min, max, invert) * (weights[k] ?? 0);
    });
    return score;
  };

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) =>
      prev.includes(country) ? prev.filter((x) => x !== country) : [...prev, country]
    );
  };
  const toggleContinent = (continent: string) => {
    setSelectedContinents((prev) =>
      prev.includes(continent) ? prev.filter((x) => x !== continent) : [...prev, continent]
    );
  };

  // Фильтрация + поиск
  const filteredCities = useMemo(() => {
    const byRegion = cities.filter((c) => {
      const countryOk = selectedCountries.length === 0 || selectedCountries.includes(c.country);
      const continentOk = selectedContinents.length === 0 || selectedContinents.includes(c.continent);
      const searchOk =
        !searchQuery ||
        c.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.country.toLowerCase().includes(searchQuery.toLowerCase());
      return countryOk && continentOk && searchOk;
    });
    return byRegion;
  }, [cities, selectedCountries, selectedContinents, searchQuery]);

  const ranked = useMemo(() => {
    return filteredCities
      .map((c) => ({ ...c, score: computeScore(c) }))
      .sort((a, b) => b.score - a.score);
  }, [filteredCities, weights, audience]);

  /** имитация “Live Data” (без внешних вызовов, чтобы не ломать SSR) */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // имитация небольшой задержки
    await new Promise((r) => setTimeout(r, 700));
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок + поиск/кнопки */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <h1 className="text-4xl font-bold text-slate-800 mb-2">World Cities Ranking</h1>
              <p className="text-slate-600">Discover your perfect city based on what matters most to you</p>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none lg:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  placeholder="Search cities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-3 py-2 w-full bg-white/80 backdrop-blur border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <ButtonBase
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="bg-white/80 backdrop-blur hover:bg-white border-slate-200"
                aria-label="Filters"
                title="Filters are below (weights & region)"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </ButtonBase>

              <ButtonBase
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-white/80 backdrop-blur hover:bg-white border-slate-200"
              >
                {isRefreshing ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2 text-yellow-500" />
                )}
                Live Data
              </ButtonBase>
            </div>
          </div>
        </div>

        {/* Контролы слева + список правее */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Контролы (веса + фильтры регионов) */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Audience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(['living', 'business', 'tourism', 'all'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setAudience(k)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition text-sm font-medium
                      ${audience === k
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    {audienceProfiles[k].label}
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Factors & Weights ({audienceProfiles[audience].label})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                {audienceProfiles[audience].factors.map((key) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="font-mono">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                      <Badge className="bg-slate-100 text-slate-700 border border-slate-200">{weights[key] ?? 0}</Badge>
                    </div>
                    <Slider
                      value={weights[key] ?? 0}
                      min={0}
                      max={10}
                      step={1}
                      onChange={(v) => setWeights((prev) => ({ ...prev, [key]: v }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Region Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-sm font-semibold mb-2">Continents</p>
                  <div className="flex flex-wrap gap-2">
                    {allContinents.map((c) => (
                      <span
                        key={c}
                        onClick={() => toggleContinent(c)}
                        className={`px-3 py-1 rounded-full cursor-pointer text-xs border transition
                          ${selectedContinents.includes(c)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'}`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">Countries</p>
                  <input
                    placeholder="Filter countries..."
                    value={countryInput}
                    onChange={(e) => setCountryInput(e.target.value)}
                    className="border rounded px-3 py-2 w-full outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <div className="max-h-44 overflow-y-auto border rounded-xl mt-2 p-2 space-y-1">
                    {filteredCountries.map((c) => (
                      <label
                        key={c}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded"
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
              </CardContent>
            </Card>
          </div>

          {/* Список городов */}
          <div className="lg:col-span-3">
            <div className="grid gap-6">
              {ranked.map((c, index) => (
                <Card key={`${c.city}-${index}`} className="overflow-hidden hover:shadow-lg transition">
                  {/* “шапка” с изображением/плейсхолдером */}
                  <div className="relative h-48 bg-gradient-to-r from-slate-200 to-slate-300 overflow-hidden">
                    {/* Плейсхолдер (без внешних картинок — стабильно для SSR/hydration) */}
                    <div className={`absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-r ${getScoreGradient(c.score)}`}>
                      <MapPin className="w-12 h-12 text-white/80" />
                    </div>

                    {/* rank */}
                    <Badge className="absolute top-2 left-2 bg-white/90 text-slate-700 font-bold px-3 py-1 border border-slate-200">
                      #{index + 1}
                    </Badge>

                    {/* score bubble */}
                    <div className="absolute top-2 right-2">
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${getScoreGradient(c.score)} flex items-center justify-center shadow-lg`}>
                        <div className="text-white font-bold text-lg">
                          {Math.round(c.score)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Контент карточки */}
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-1">{c.city}</h3>
                        <div className="flex items-center gap-2 text-slate-600">
                          <MapPin className="w-4 h-4" />
                          <span className="font-medium">{c.country}</span>
                          <Badge className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                            {c.continent}
                          </Badge>
                        </div>
                      </div>

                      <ButtonBase className="bg-white hover:bg-slate-50">
                        <Plus className="w-4 h-4 mr-2" />
                        Compare
                      </ButtonBase>
                    </div>

                    {/* Ключевые метрики */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          {c.population ? `${c.population} people` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          {c.cost_index ? `${c.cost_index} cost idx` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          {c.homicide_rate ? `${(100 - c.homicide_rate).toFixed(0)}/100 safety-ish` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          {c.doctors_per_1000 ? `${c.doctors_per_1000} doctors/1k` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Бейджи-указатели качества */}
                    <div className="flex gap-2 flex-wrap">
                      {c.life_expectancy >= 78 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px]">
                          <Sparkles className="w-3 h-3 mr-1" />
                          High Life Expectancy
                        </Badge>
                      )}
                      {c.tertiary_education_enrollment >= 50 && (
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200 text-[11px]">
                          <GraduationCap className="w-3 h-3 mr-1" />
                          Strong Education
                        </Badge>
                      )}
                      {c.gdp_per_capita >= 30000 && (
                        <Badge className="bg-purple-100 text-purple-700 border border-purple-200 text-[11px]">
                          <DollarSign className="w-3 h-3 mr-1" />
                          High Income
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Если пусто */}
              {ranked.length === 0 && (
                <Card className="p-10 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-white mb-3">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="text-slate-800 font-semibold">No results</div>
                  <div className="text-slate-500 text-sm">Try adjusting filters or search query</div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
