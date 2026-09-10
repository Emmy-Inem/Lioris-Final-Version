/**
 * Campus Weather & Transit API
 * Powered by Open-Meteo (open-meteo.com) - 100% Free, zero auth required.
 */

export interface CampusCoordinates {
  name: string;
  shortName: string;
  latitude: number;
  longitude: number;
  city: string;
}

export const CAMPUS_COORDINATES: Record<string, CampusCoordinates> = {
  UI: {
    name: 'University of Ibadan',
    shortName: 'UI',
    latitude: 7.4475,
    longitude: 3.9,
    city: 'Ibadan, Oyo State',
  },
  UNILAG: {
    name: 'University of Lagos',
    shortName: 'UNILAG',
    latitude: 6.5173,
    longitude: 3.3986,
    city: 'Akoka, Lagos State',
  },
  OAU: {
    name: 'Obafemi Awolowo University',
    shortName: 'OAU',
    latitude: 7.5186,
    longitude: 4.5262,
    city: 'Ile-Ife, Osun State',
  },
  ABU: {
    name: 'Ahmadu Bello University',
    shortName: 'ABU',
    latitude: 11.1524,
    longitude: 7.6492,
    city: 'Zaria, Kaduna State',
  },
  UNN: {
    name: 'University of Nigeria, Nsukka',
    shortName: 'UNN',
    latitude: 6.8645,
    longitude: 7.4083,
    city: 'Nsukka, Enugu State',
  },
  CU: {
    name: 'Covenant University',
    shortName: 'CU',
    latitude: 6.6718,
    longitude: 3.1581,
    city: 'Ota, Ogun State',
  },
  UNILORIN: {
    name: 'University of Ilorin',
    shortName: 'UNILORIN',
    latitude: 8.4799,
    longitude: 4.6714,
    city: 'Ilorin, Kwara State',
  },
  FUTA: {
    name: 'Federal Univ. of Technology, Akure',
    shortName: 'FUTA',
    latitude: 7.3045,
    longitude: 5.1378,
    city: 'Akure, Ondo State',
  },
  UNIBEN: {
    name: 'University of Benin',
    shortName: 'UNIBEN',
    latitude: 6.335,
    longitude: 5.6037,
    city: 'Benin City, Edo State',
  },
};

export interface CampusWeather {
  campus: CampusCoordinates;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  precipitationProbability: number;
  weatherCode: number;
  condition: string;
  iconName: 'sunny' | 'partly-sunny' | 'cloudy' | 'rainy' | 'thunderstorm';
  isDay: boolean;
  transitAdvice: string;
  tempMax: number;
  tempMin: number;
  fetchedAt: string;
}

function decodeWmoCode(code: number): { condition: string; iconName: CampusWeather['iconName'] } {
  if (code === 0) return { condition: 'Clear Sky', iconName: 'sunny' };
  if (code === 1 || code === 2) return { condition: 'Partly Cloudy', iconName: 'partly-sunny' };
  if (code === 3) return { condition: 'Overcast', iconName: 'cloudy' };
  if ([45, 48].includes(code)) return { condition: 'Foggy / Hazy', iconName: 'cloudy' };
  if ([51, 53, 55, 61, 63, 65].includes(code)) return { condition: 'Rain Showers', iconName: 'rainy' };
  if ([80, 81, 82].includes(code)) return { condition: 'Heavy Rain', iconName: 'rainy' };
  if ([95, 96, 99].includes(code)) return { condition: 'Thunderstorm', iconName: 'thunderstorm' };
  return { condition: 'Fair Weather', iconName: 'partly-sunny' };
}

function generateTransitAdvice(temp: number, precipProb: number, code: number): string {
  if (code >= 95) {
    return '⚡ Thunderstorm alert: Stay inside lecture halls or library; campus shuttles may have delays.';
  }
  if (precipProb >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return '🌧️ Rain expected: Carry an umbrella for walking between departments or taking campus shuttles.';
  }
  if (temp >= 33) {
    return '☀️ High heat: Stay hydrated on long walks to faculties and use covered shaded pathways.';
  }
  if (temp <= 22) {
    return '🍃 Cool morning breeze: Ideal walking weather across academic quads and hostels.';
  }
  return '🚶 Great campus walking conditions: Smooth transit across campus and study centers.';
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const weatherCache = new Map<string, { data: CampusWeather; timestamp: number }>();

export function resolveCampus(campusQuery?: string | null): CampusCoordinates {
  if (!campusQuery) return CAMPUS_COORDINATES.UI;
  const upper = campusQuery.toUpperCase().trim();
  for (const [key, value] of Object.entries(CAMPUS_COORDINATES)) {
    if (upper === key || upper.includes(key) || value.name.toUpperCase().includes(upper)) {
      return value;
    }
  }
  return CAMPUS_COORDINATES.UI;
}

export async function fetchCampusWeather(campusQuery?: string | null): Promise<CampusWeather> {
  const campus = resolveCampus(campusQuery);
  const cacheKey = campus.shortName;

  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${campus.latitude}&longitude=${campus.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FLagos`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo status ${res.status}`);
    }

    const json = await res.json();
    const current = json.current || {};
    const daily = json.daily || {};

    const code = current.weather_code ?? 1;
    const { condition, iconName } = decodeWmoCode(code);
    const temp = Math.round(current.temperature_2m ?? 27);
    const precipProb = daily.precipitation_probability_max?.[0] ?? (current.precipitation > 0 ? 80 : 10);
    const transitAdvice = generateTransitAdvice(temp, precipProb, code);

    const weatherData: CampusWeather = {
      campus,
      temperature: temp,
      apparentTemperature: Math.round(current.apparent_temperature ?? temp),
      humidity: Math.round(current.relative_humidity_2m ?? 65),
      windSpeed: Math.round(current.wind_speed_10m ?? 12),
      precipitationProbability: precipProb,
      weatherCode: code,
      condition,
      iconName,
      isDay: Boolean(current.is_day ?? 1),
      transitAdvice,
      tempMax: Math.round(daily.temperature_2m_max?.[0] ?? temp + 3),
      tempMin: Math.round(daily.temperature_2m_min?.[0] ?? temp - 4),
      fetchedAt: new Date().toISOString(),
    };

    weatherCache.set(cacheKey, { data: weatherData, timestamp: Date.now() });
    return weatherData;
  } catch (err: any) {
    console.warn('[CampusWeather] Fetch failed, returning fallback:', err?.message ?? err);
    return {
      campus,
      temperature: 28,
      apparentTemperature: 30,
      humidity: 68,
      windSpeed: 10,
      precipitationProbability: 15,
      weatherCode: 1,
      condition: 'Partly Cloudy',
      iconName: 'partly-sunny',
      isDay: true,
      transitAdvice: '🚶 Clear campus walking conditions across academic quads and hostels.',
      tempMax: 31,
      tempMin: 23,
      fetchedAt: new Date().toISOString(),
    };
  }
}
