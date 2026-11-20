import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatFetchedTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function WeatherGlyph({ code, isDay }: { code: number; isDay: boolean }) {
  const className = "w-7 h-7 text-neutral-800 shrink-0";
  if (code === 0) {
    return isDay ? (
      <Sun className="w-7 h-7 text-amber-500 shrink-0" strokeWidth={1.75} />
    ) : (
      <Moon className={className} strokeWidth={1.75} />
    );
  }
  if (code === 1 || code === 2) {
    return <CloudSun className={className} strokeWidth={1.75} />;
  }
  if (code === 3) {
    return <Cloud className={className} strokeWidth={1.75} />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog className={className} strokeWidth={1.75} />;
  }
  if (code >= 51 && code <= 57) {
    return <CloudDrizzle className={className} strokeWidth={1.75} />;
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className="w-7 h-7 text-sky-600 shrink-0" strokeWidth={1.75} />;
  }
  if (code >= 95 && code <= 99) {
    return <CloudLightning className={className} strokeWidth={1.75} />;
  }
  return <CloudSun className={className} strokeWidth={1.75} />;
}

export default function App() {
  const [data, setData] = useState<NhaTrangPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    }
    try {
      const endpoint = manual ? "/api/nhatrang?refresh=1" : "/api/nhatrang";
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as NhaTrangPayload;
      setData(json);
      setError(null);
    } catch {
      setError("실시간 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
    const interval = window.setInterval(() => {
      void loadData(false);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  return (
    <main className="min-h-screen bg-white text-neutral-900 flex flex-col justify-center">
      <div className="w-full max-w-6xl mx-auto px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex items-center justify-between gap-4 pb-6 mb-6 border-b border-neutral-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              나트랑 실시간 정보
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500 font-num">
              {data?.fetchedAt
                ? `업데이트 ${formatFetchedTime(data.fetchedAt)}`
                : "실시간 데이터 연결 중"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-neutral-900 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
            <span>새로고침</span>
          </button>
        </div>

        {error && !data ? (
          <div className="p-8 border border-neutral-200 rounded-2xl bg-white text-center">
            <p className="text-sm text-neutral-700">{error}</p>
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="mt-4 inline-flex items-center justify-center min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              다시 불러오기
            </button>
          </div>
        ) : (
          <section
            aria-label="나트랑 핵심 실시간 정보 3가지"
            className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch"
          >
            {/* 1. 나트랑 날씨 */}
            <article className="flex flex-col justify-between p-6 sm:p-7 bg-white border border-neutral-200 rounded-2xl">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-neutral-950">
                    나트랑 날씨
                  </h2>
                  <span className="text-xs text-neutral-500 font-num whitespace-nowrap">
                    {data?.weather ? `현지 ${data.weather.localTime}` : "—"}
                  </span>
                </div>

                {loading && !data ? (
                  <div className="mt-8 space-y-3 animate-pulse">
                    <div className="h-12 w-32 bg-neutral-100 rounded-lg" />
                    <div className="h-4 w-24 bg-neutral-100 rounded" />
                  </div>
                ) : data?.weather ? (
                  <div className="mt-6">
                    <div className="flex items-center gap-3.5">
                      <span className="font-num text-5xl font-semibold tracking-tight text-neutral-950">
                        {data.weather.temperature}°
                      </span>
                      <div className="flex items-center gap-2">
                        <WeatherGlyph
                          code={data.weather.weatherCode}
                          isDay={data.weather.isDay}
                        />
                        <span className="text-base font-medium text-neutral-800">
                          {data.weather.conditionLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-neutral-500">
                    날씨 정보를 불러올 수 없습니다.
                  </p>
                )}
              </div>

              {data?.weather && (
                <dl className="mt-8 pt-5 border-t border-neutral-100 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-500">체감 온도</dt>
                    <dd className="mt-0.5 font-num font-medium text-neutral-900">
                      {data.weather.apparentTemperature}°C
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">최저 / 최고</dt>
                    <dd className="mt-0.5 font-num font-medium text-neutral-900">
                      {data.weather.tempMin ?? "—"}° /{" "}
                      {data.weather.tempMax ?? "—"}°
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">습도</dt>
                    <dd className="mt-0.5 font-num font-medium text-neutral-900">
                      {data.weather.humidity}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">풍속</dt>
                    <dd className="mt-0.5 font-num font-medium text-neutral-900">
                      {data.weather.windSpeed} km/h
                    </dd>
                  </div>
                </dl>
              )}
            </article>

            {/* 2. 베트남 환율 */}
            <article className="flex flex-col justify-between p-6 sm:p-7 bg-white border border-neutral-200 rounded-2xl">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-neutral-950">
                    베트남 환율
                  </h2>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    시장 기준 · 시중은행
                  </span>
                </div>

                {loading && !data ? (
                  <div className="mt-8 space-y-3 animate-pulse">
                    <div className="h-10 w-44 bg-neutral-100 rounded-lg" />
                    <div className="h-7 w-36 bg-neutral-100 rounded-lg" />
                  </div>
                ) : data?.exchange ? (
                  <div className="mt-6 space-y-4">
                    <div>
                      <p className="text-xs text-neutral-500">1 USD (미국 달러)</p>
                      <p className="mt-1 font-num text-3xl sm:text-[2.15rem] font-semibold tracking-tight text-neutral-950">
                        {formatNumber(data.exchange.marketUsdToVnd)}{" "}
                        <span className="text-base font-medium text-neutral-500">
                          VND
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">1,000 KRW (한국 원)</p>
                      <p className="mt-1 font-num text-2xl font-semibold tracking-tight text-neutral-900">
                        {formatNumber(
                          Math.round(data.exchange.marketKrwToVnd * 1000)
                        )}{" "}
                        <span className="text-sm font-medium text-neutral-500">
                          VND
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-neutral-500">
                    환율 정보를 불러올 수 없습니다.
                  </p>
                )}
              </div>

              {data?.exchange && (
                <dl className="mt-8 pt-5 border-t border-neutral-100 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-neutral-500">10,000 VND (만 동)</dt>
                    <dd className="font-num font-medium text-neutral-900">
                      약 {formatNumber(data.exchange.tenThousandVndToKrw)}원
                    </dd>
                  </div>
                  {data.exchange.vcbUsdBuy != null && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">비엣콤뱅크 USD 매입</dt>
                      <dd className="font-num font-medium text-neutral-900">
                        {formatNumber(data.exchange.vcbUsdBuy)} VND
                      </dd>
                    </div>
                  )}
                  {data.exchange.vcbUsdSell != null && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">비엣콤뱅크 USD 매도</dt>
                      <dd className="font-num font-medium text-neutral-900">
                        {formatNumber(data.exchange.vcbUsdSell)} VND
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </article>

            {/* 3. 김청 환전소 100달러 */}
            <article className="flex flex-col justify-between p-6 sm:p-7 bg-white border border-neutral-200 rounded-2xl">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-neutral-950">
                    김청 환전소 100달러
                  </h2>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    100 USD 신권 기준
                  </span>
                </div>

                {loading && !data ? (
                  <div className="mt-8 space-y-3 animate-pulse">
                    <div className="h-12 w-52 bg-neutral-100 rounded-lg" />
                    <div className="h-4 w-36 bg-neutral-100 rounded" />
                  </div>
                ) : data?.kimchung ? (
                  <div className="mt-6">
                    <p className="text-xs text-neutral-500">
                      예상 수령 베트남 통화
                    </p>
                    <p className="mt-1 font-num text-3xl sm:text-[2.25rem] font-semibold tracking-tight text-teal-800">
                      {formatNumber(data.kimchung.hundredUsdVnd)}{" "}
                      <span className="text-base font-medium text-teal-700">
                        VND
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-neutral-500 font-num">
                      1 USD = {formatNumber(data.kimchung.usdBuyRate)} VND
                      {data.kimchung.hundredUsdKrwApprox != null &&
                        ` · 약 ${formatNumber(data.kimchung.hundredUsdKrwApprox)}원`}
                    </p>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-neutral-500">
                    김청 환전소 시세를 불러올 수 없습니다.
                  </p>
                )}
              </div>

              {data?.kimchung && (
                <div className="mt-8 pt-5 border-t border-neutral-100 space-y-2.5 text-sm">
                  {data.kimchung.diffVsBankHundredUsd != null && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-500">
                        시중은행($100 매입) 대비
                      </span>
                      <span className="font-num font-medium text-teal-800">
                        {data.kimchung.diffVsBankHundredUsd >= 0 ? "+" : ""}
                        {formatNumber(data.kimchung.diffVsBankHundredUsd)} VND
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-500">위치</span>
                    <span className="text-neutral-900 font-medium text-right">
                      51 Ngô Gia Tự, Nha Trang
                    </span>
                  </div>
                  <p className="pt-1 text-xs leading-relaxed text-neutral-500">
                    {data.kimchung.sourceLabel}
                  </p>
                </div>
              )}
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
