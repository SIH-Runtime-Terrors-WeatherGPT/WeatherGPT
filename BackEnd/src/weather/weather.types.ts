/** Normalised weather shape returned to callers — never the raw OpenWeather response. */
export interface WeatherData {
  /** Display name, e.g. "London, GB" */
  location: string;
  /** ISO 8601 date string for today, e.g. "2026-09-12" */
  date: string;
  /** Current temperature in °C */
  temperature: number;
  /** Today's forecasted high in °C */
  temperatureHigh: number;
  /** Today's forecasted low in °C */
  temperatureLow: number;
  /** Probability of rain 0–100 (%) */
  rainProbability: number;
  /** Human-readable sky condition, e.g. "clear sky", "moderate rain" */
  condition: string;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Relative humidity 0–100 (%) */
  humidity: number;
  /** Relative or exact date requested by user, e.g. "2026-09-20" */
  requestedDate?: string;
  /** True if requested date is beyond the OpenWeather 5-day forecast limit */
  isForecastLimitReached?: boolean;
}

// ─── Raw OpenWeather shapes (internal use only) ───────────────────────────────

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

export interface OWCurrentWeather {
  name: string;
  sys: { country: string };
  main: {
    temp: number;
    temp_min: number;
    temp_max: number;
    humidity: number;
  };
  weather: Array<{ description: string }>;
  wind: { speed: number };
  rain?: { '1h'?: number; '3h'?: number };
}

export interface OWForecastItem {
  dt_txt: string;
  main: { temp: number; temp_min: number; temp_max: number; humidity?: number };
  pop?: number; // probability of precipitation 0–1
  weather?: Array<{ description: string }>;
  wind?: { speed: number };
}

export interface OWForecastResponse {
  list: OWForecastItem[];
}
