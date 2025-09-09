const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("❌ Нет API ключа! Добавь его в .env");
  process.exit(1);
}

const jsonFilePath = path.join(__dirname, "../public/data/cities_final_with_continent.json");

let cityData = [];
try {
  if (fs.existsSync(jsonFilePath)) {
    const raw = fs.readFileSync(jsonFilePath, "utf-8");
    cityData = JSON.parse(raw);
  }
} catch (err) {
  console.error("Ошибка при чтении JSON:", err.message);
}

// Функция запроса к LLM
async function fetchCityData(cityName) {
  const prompt = `
Provide strictly valid JSON (no extra text) with the following fields for the city of ${cityName}:
cost_of_living_index (number),
average_salary (number),
safety_index (number),
healthcare_index (number),
pollution_index (number),
climate_index (number),
quality_of_life_index (number),
education_index (number),
transport_index (number),
internet_speed (number),
english_proficiency (number),
population (number),
life_expectancy (number)
Return only JSON, nothing else.
`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "cognitivecomputations/dolphin3.0-r1-mistral-24b:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    let content = response.data.choices[0].message.content;

    // Очистка кавычек
    content = content.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    try {
      return JSON.parse(content);
    } catch (parseErr) {
      console.error(`Ошибка парсинга JSON для ${cityName}:`, parseErr.message);
      console.log("Ответ LLM:", content);
      return null;
    }
  } catch (err) {
    console.error(`Ошибка при получении данных для ${cityName}:`, err.message);
    return null;
  }
}

async function main() {
  if (!Array.isArray(cityData) || cityData.length === 0) {
    console.log("⚠️ JSON пустой или не массив. Добавьте хотя бы один объект города.");
    return;
  }

  for (const cityObj of cityData) {
    const cityName = cityObj.name;
    console.log(`⏳ Обрабатываю ${cityName}...`);
    const llmData = await fetchCityData(cityName);
    if (llmData) {
      Object.assign(cityObj, llmData); // Добавляем новые поля к существующему объекту
      console.log(`✅ Данные для ${cityName} обновлены`);
    }
    await new Promise((r) => setTimeout(r, 2000)); // Пауза 2 сек
  }

  fs.writeFileSync(jsonFilePath, JSON.stringify(cityData, null, 2), "utf-8");
  console.log(`\n🎉 Все данные сохранены в ${jsonFilePath}`);
}

main();
