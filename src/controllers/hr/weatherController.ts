import { Request, Response } from "express";
import { findCompany } from "./workCalendar";

/**
 * ອາກາດຕອນນີ້ ທີ່ຕັ້ງບໍລິສັດ (ຫົວໜ້າຫຼັກຂອງແອັບ ປ່ຽນຕາມອາກາດແທ້: ຮ້ອນ / ເຢັນ / ໜາວ / ຝົນ / ເມກ / ໝອກ)
 *
 * - GET /weather/me → { temperature, feels_like, symbol, humidity, precipitation, updated_at, source }
 * - symbol = ສັນຍາລັກຄາດຄະເນ 1 ຊົ່ວໂມງຂ້າງໜ້າຂອງ MET, ແຕ່ຝົນປອຍໆ (< RAIN_MM ມມ) ບໍ່ນັບວ່າຝົນຕົກ — ໃຊ້ເມກຕອນນີ້ແທນ
 *   (MET ມັກຄາດຄະເນ "lightrain" 0.1–0.4 ມມ ທີ່ຄົນບໍ່ຮູ້ສຶກ → ແອັບບອກວ່າຝົນຕົກ ທັງທີ່ແດດອອກ)
 * - feels_like = ອຸນຫະພູມທີ່ຮູ້ສຶກ (Apparent Temperature ຂອງ BOM: ອຸນຫະພູມ + ຄວາມຊຸ່ມ + ລົມ) — ລາວຊຸ່ມ ຮູ້ສຶກຮ້ອນກວ່າບາຫຼອດ
 * - ຂໍ້ມູນຈາກ MET Norway Locationforecast 2.0 (ໃຊ້ຟຣີ ລວມທັງບໍລິສັດ, ໃບອະນຸຍາດ CC BY 4.0 — ແອັບສະແດງ "ຂໍ້ມູນ: MET Norway")
 * - ເກັບໄວ້ໃນໜ່ວຍຄວາມຈຳ 30 ນາທີ (ພະນັກງານທຸກຄົນໃຊ້ຊຸດດຽວກັນ — ບໍ່ຍິງ MET ທຸກເທື່ອທີ່ເປີດແອັບ);
 *   MET ຜິດພາດ = ສົ່ງຂອງເກົ່າ (ບໍ່ເກີນ 6 ຊົ່ວໂມງ)
 * - MET ຂໍໃຫ້ລະບຸຊື່ແອັບໃນ User-Agent: ຕັ້ງ WEATHER_USER_AGENT ໃນ .env (ເຊັ່ນ "oac-hr/1.0 ເວັບໄຊ ຫຼື ອີເມວຕິດຕໍ່")
 */

const API = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const FRESH_MS = 30 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;
/** ຝົນໃນ 1 ຊົ່ວໂມງ ຕ່ຳກວ່ານີ້ (ມມ) = ບໍ່ສະແດງວ່າຝົນຕົກ */
const RAIN_MM = 0.5;

type Weather = {
  temperature: number;
  feels_like: number | null;
  symbol: string;
  humidity: number | null;
  precipitation: number | null;
  updated_at: string;
  source: string;
};

/** ອຸນຫະພູມທີ່ຮູ້ສຶກ (°C) — Australian BOM: AT = T + 0.33e − 0.70·ລົມ(m/s) − 4, e = ຄວາມດັນໄອນ້ຳ (hPa) */
const apparent = (t: number, rh: number, wind: number) => {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * wind - 4;
};

/** ທ້ອງຟ້າຈາກເມກຕອນນີ້ (%) ໃນຮູບແບບສັນຍາລັກຂອງ MET — ໃຊ້ແທນສັນຍາລັກຝົນເມື່ອຝົນໜ້ອຍເກີນ */
const skyOf = (cloud: number, time: string) => {
  const hour = (new Date(time).getUTCHours() + 7) % 24; // ເວລາລາວ
  const part = hour >= 6 && hour < 18 ? "_day" : "_night";
  if (!Number.isFinite(cloud)) return `partlycloudy${part}`;
  if (cloud < 15) return `clearsky${part}`;
  if (cloud < 45) return `fair${part}`;
  if (cloud < 85) return `partlycloudy${part}`;
  return "cloudy";
};

let cache: { key: string; at: number; data: Weather } | null = null;

/** ຈຸດເວລາທີ່ໃກ້ປັດຈຸບັນທີ່ສຸດ (ບໍ່ເກີນປັດຈຸບັນ) ຂອງ timeseries */
const currentOf = (series: any[]) => {
  const now = Date.now();
  let best = series[0];
  for (const point of series) {
    if (Date.parse(point?.time) <= now) best = point;
    else break;
  }
  return best;
};

const fetchWeather = async (lat: number, lon: number): Promise<Weather> => {
  // MET ຂໍໃຫ້ໃຊ້ທົດສະນິຍົມບໍ່ເກີນ 4 ຕຳແໜ່ງ (cache ຂອງເຂົາເຈົ້າ)
  const url = `${API}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const answer = await fetch(url, {
    headers: { "User-Agent": process.env.WEATHER_USER_AGENT || "oac-hr-app/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!answer.ok) throw new Error(`MET ${answer.status}`);
  const body: any = await answer.json();
  const series = body?.properties?.timeseries;
  if (!Array.isArray(series) || series.length === 0) throw new Error("MET: no timeseries");
  const point = currentOf(series);
  const details = point?.data?.instant?.details ?? {};
  const next1 = point?.data?.next_1_hours;
  let symbol = String(next1?.summary?.symbol_code ?? point?.data?.next_6_hours?.summary?.symbol_code ?? "");
  const rain = Number(next1?.details?.precipitation_amount);
  // ຝົນປອຍໆ = ບໍ່ນັບ (ໃຊ້ເມກຕອນນີ້); ບໍ່ຮູ້ປະລິມານ = ເຊື່ອສັນຍາລັກ
  if (/rain|sleet|snow|thunder/.test(symbol) && Number.isFinite(rain) && rain < RAIN_MM) {
    symbol = skyOf(Number(details.cloud_area_fraction), String(point?.time ?? new Date().toISOString()));
  }
  const temperature = Number(details.air_temperature);
  if (!Number.isFinite(temperature)) throw new Error("MET: no temperature");
  const humidity = Number(details.relative_humidity);
  const wind = Number(details.wind_speed);
  const feels = Number.isFinite(humidity) ? apparent(temperature, humidity, Number.isFinite(wind) ? wind : 0) : NaN;
  return {
    temperature: Math.round(temperature * 10) / 10,
    feels_like: Number.isFinite(feels) ? Math.round(feels * 10) / 10 : null,
    symbol,
    humidity: Number.isFinite(humidity) ? Math.round(humidity) : null,
    precipitation: Number.isFinite(rain) ? rain : null,
    updated_at: String(point?.time ?? new Date().toISOString()),
    source: "MET Norway",
  };
};

/** GET /weather/me */
export const getMyWeather = async (_req: Request, res: Response) => {
  try {
    const company = await findCompany();
    const lat = Number(company?.latitude);
    const lon = Number(company?.longitude);
    if (!company || company.latitude == null || company.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(404).json({ message: "ບໍລິສັດຍັງບໍ່ໄດ້ປັກໝຸດທີ່ຕັ້ງ — ບໍ່ມີຂໍ້ມູນອາກາດ" });
      return;
    }
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const now = Date.now();
    if (cache && cache.key === key && now - cache.at < FRESH_MS) {
      res.status(200).json(cache.data);
      return;
    }
    try {
      const data = await fetchWeather(lat, lon);
      cache = { key, at: now, data };
      res.status(200).json(data);
    } catch (error) {
      // ຂອງເກົ່າຍັງໃຊ້ໄດ້ = ສົ່ງຂອງເກົ່າ (ອາກາດບໍ່ສຳຄັນພໍທີ່ຈະໃຫ້ແອັບຂຶ້ນ error)
      if (cache && cache.key === key && now - cache.at < STALE_MS) {
        res.status(200).json(cache.data);
        return;
      }
      console.error("weather:", error);
      res.status(503).json({ message: "ດຶງຂໍ້ມູນອາກາດບໍ່ໄດ້ຕອນນີ້" });
    }
  } catch (error) {
    console.error("weather:", error);
    res.status(500).json({ message: "Error getting weather" });
  }
};
