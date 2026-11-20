import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  conditionLabel: string;
  isDay: boolean;
  tempMin: number | null;
  tempMax: number | null;
  localTime: string;
}

interface ExchangeData {
  marketUsdToVnd: number;
  marketUsdToKrw: number;
  marketKrwToVnd: number;
  tenThousandVndToKrw: number;
  vcbUsdBuy: number | null;
  vcbUsdTransfer: number | null;
  vcbUsdSell: number | null;
  vcbKrwBuy: number | null;
  vcbKrwSell: number | null;
  updatedLabel: string | null;
}

interface KimChungData {
  usdBuyRate: number;
  usdSellRate: number | null;
  hundredUsdVnd: number;
  hundredUsdKrwApprox: number | null;
  diffVsBankHundredUsd: number | null;
  sourceLabel: string;
  isLiveFreeMarket: boolean;
}

interface NhaTrangPayload {
  weather: WeatherData | null;
  exchange: ExchangeData | null;
  kimchung: KimChungData | null;
  fetchedAt: string;
}

const CACHE_TTL_MS = 60 * 1000;
let cachedPayload: NhaTrangPayload | null = null;
let cachedAtMs = 0;

function mapWmoCodeToKorean(code: number): string {
  if (code === 0) return "맑음";
  if (code === 1 || code === 2) return "대체로 맑음";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 95 && code <= 99) return "뇌우";
  return "구름 조금";
}

function formatNhaTrangTime(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function parseNumberString(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseVietnameseRate(raw: string | undefined): number | null {
  if (!raw) return null;
  // Format on tygiado.com is "25.948" (dot as thousands separator)
  const digits = raw.replace(/\./g, "").replace(/,/g, "").trim();
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed < 15000 || parsed > 40000) {
    return null;
  }
  return parsed;
}

async function fetchWeather(): Promise<WeatherData> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=12.2388&longitude=109.1967&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FHo_Chi_Minh&forecast_days=1";

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      is_day: number;
    };
    daily?: {
      temperature_2m_min?: number[];
      temperature_2m_max?: number[];
    };
  };

  return {
    temperature: Math.round(data.current.temperature_2m * 10) / 10,
    apparentTemperature: Math.round(data.current.apparent_temperature * 10) / 10,
    humidity: Math.round(data.current.relative_humidity_2m),
    windSpeed: Math.round(data.current.wind_speed_10m * 10) / 10,
    weatherCode: data.current.weather_code,
    conditionLabel: mapWmoCodeToKorean(data.current.weather_code),
    isDay: data.current.is_day === 1,
    tempMin:
      typeof data.daily?.temperature_2m_min?.[0] === "number"
        ? Math.round(data.daily.temperature_2m_min[0])
        : null,
    tempMax:
      typeof data.daily?.temperature_2m_max?.[0] === "number"
        ? Math.round(data.daily.temperature_2m_max[0])
        : null,
    localTime: formatNhaTrangTime(),
  };
}

async function fetchExchange(): Promise<ExchangeData> {
  const [erResult, vcbResult] = await Promise.allSettled([
    fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`ER-API HTTP ${r.status}`);
      return (await r.json()) as {
        rates: Record<string, number>;
        time_last_update_utc?: string;
      };
    }),
    fetch(
      "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10",
      {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    ).then(async (r) => {
      if (!r.ok) throw new Error(`VCB HTTP ${r.status}`);
      return await r.text();
    }),
  ]);

  if (erResult.status !== "fulfilled") {
    throw new Error("Market FX API failed");
  }

  const rates = erResult.value.rates;
  const usdToVnd = rates.VND;
  const usdToKrw = rates.KRW;
  if (!usdToVnd || !usdToKrw) {
    throw new Error("Missing VND/KRW rates");
  }

  const krwToVnd = usdToVnd / usdToKrw;
  const tenThousandVndToKrw = Math.round(10000 / krwToVnd);

  let vcbUsdBuy: number | null = null;
  let vcbUsdTransfer: number | null = null;
  let vcbUsdSell: number | null = null;
  let vcbKrwBuy: number | null = null;
  let vcbKrwSell: number | null = null;

  if (vcbResult.status === "fulfilled") {
    const xml = vcbResult.value;
    const usdMatch = xml.match(
      /<Exrate[^>]*CurrencyCode="USD"[^>]*Buy="([^"]*)"[^>]*Transfer="([^"]*)"[^>]*Sell="([^"]*)"/i
    );
    if (usdMatch) {
      vcbUsdBuy = parseNumberString(usdMatch[1]);
      vcbUsdTransfer = parseNumberString(usdMatch[2]);
      vcbUsdSell = parseNumberString(usdMatch[3]);
    }
    const krwMatch = xml.match(
      /<Exrate[^>]*CurrencyCode="KRW"[^>]*Buy="([^"]*)"[^>]*Transfer="([^"]*)"[^>]*Sell="([^"]*)"/i
    );
    if (krwMatch) {
      vcbKrwBuy = parseNumberString(krwMatch[1]);
      vcbKrwSell = parseNumberString(krwMatch[3]);
    }
  }

  return {
    marketUsdToVnd: Math.round(usdToVnd),
    marketUsdToKrw: Math.round(usdToKrw * 10) / 10,
    marketKrwToVnd: Math.round(krwToVnd * 100) / 100,
    tenThousandVndToKrw,
    vcbUsdBuy,
    vcbUsdTransfer,
    vcbUsdSell,
    vcbKrwBuy,
    vcbKrwSell,
    updatedLabel: erResult.value.time_last_update_utc ?? null,
  };
}

async function fetchFreeMarketUsdRate(): Promise<{
  usdBuyRate: number;
  usdSellRate: number | null;
}> {
  const res = await fetch("https://tygiado.com/", {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NhaTrangTravelInfo/1.0)",
    },
  });
  if (!res.ok) {
    throw new Error(`tygiado HTTP ${res.status}`);
  }
  const html = await res.text();
  const sectionIdx = html.indexOf("Ngoại tệ chợ đen");
  if (sectionIdx === -1) {
    throw new Error("Free market section not found");
  }
  const snippet = html.slice(sectionIdx, sectionIdx + 2000);
  const usdRowMatch = snippet.match(
    /USD[\s\S]*?<td[^>]*>\s*([0-9.,]+)\s*<\/td>\s*<td[^>]*>\s*([0-9.,]+)\s*<\/td>/i
  );
  if (!usdRowMatch) {
    throw new Error("Free market USD row not found");
  }
  const usdBuyRate = parseVietnameseRate(usdRowMatch[1]);
  const usdSellRate = parseVietnameseRate(usdRowMatch[2]);
  if (!usdBuyRate) {
    throw new Error("Invalid free market USD rate");
  }
  return { usdBuyRate, usdSellRate };
}

async function getNhaTrangSnapshot(forceRefresh: boolean): Promise<NhaTrangPayload> {
  const now = Date.now();
  if (!forceRefresh && cachedPayload && now - cachedAtMs < CACHE_TTL_MS) {
    return {
      ...cachedPayload,
      weather: cachedPayload.weather
        ? { ...cachedPayload.weather, localTime: formatNhaTrangTime() }
        : null,
    };
  }

  const [weatherRes, exchangeRes, freeMarketRes] = await Promise.allSettled([
    fetchWeather(),
    fetchExchange(),
    fetchFreeMarketUsdRate(),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const exchange = exchangeRes.status === "fulfilled" ? exchangeRes.value : null;

  let kimchung: KimChungData | null = null;
  if (freeMarketRes.status === "fulfilled") {
    const { usdBuyRate, usdSellRate } = freeMarketRes.value;
    const hundredUsdVnd = Math.round(usdBuyRate * 100);
    const hundredUsdKrwApprox = exchange
      ? Math.round(hundredUsdVnd / exchange.marketKrwToVnd)
      : null;
    const diffVsBankHundredUsd =
      exchange?.vcbUsdBuy != null
        ? hundredUsdVnd - Math.round(exchange.vcbUsdBuy * 100)
        : null;

    kimchung = {
      usdBuyRate,
      usdSellRate,
      hundredUsdVnd,
      hundredUsdKrwApprox,
      diffVsBankHundredUsd,
      sourceLabel: "베트남 사설 금은방 실시간 매입 시세 기준 (100달러 신권)",
      isLiveFreeMarket: true,
    };
  } else if (exchange) {
    const usdBuyRate = exchange.marketUsdToVnd;
    const hundredUsdVnd = Math.round(usdBuyRate * 100);
    const hundredUsdKrwApprox = Math.round(hundredUsdVnd / exchange.marketKrwToVnd);
    const diffVsBankHundredUsd =
      exchange.vcbUsdBuy != null
        ? hundredUsdVnd - Math.round(exchange.vcbUsdBuy * 100)
        : null;

    kimchung = {
      usdBuyRate,
      usdSellRate: null,
      hundredUsdVnd,
      hundredUsdKrwApprox,
      diffVsBankHundredUsd,
      sourceLabel: "사설 시세 일시 지연 · 실시간 시장 기준환율 환산",
      isLiveFreeMarket: false,
    };
  }

  const payload: NhaTrangPayload = {
    weather,
    exchange,
    kimchung,
    fetchedAt: new Date().toISOString(),
  };

  cachedPayload = payload;
  cachedAtMs = now;
  return payload;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get("/api/nhatrang", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "1";
      const data = await getNhaTrangSnapshot(forceRefresh);
      if (!data.weather && !data.exchange && !data.kimchung) {
        res.status(502).json({ error: "실시간 데이터를 불러오지 못했습니다." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      console.error("Failed to fetch Nha Trang data:", error);
      res.status(500).json({ error: "서버에서 실시간 정보를 가져오는 중 오류가 발생했습니다." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Build output not found.");
      }
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
