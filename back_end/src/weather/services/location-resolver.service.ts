import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { AxiosError } from 'axios';
import { throwError } from 'rxjs';
import { RedisService } from '../../cache/redis.service';
import { WeatherIntentSchema } from '../../gemini/gemini.service';



export interface LocationCandidate {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
  type?: string;
}

export interface ResolvedLocationResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  country: string;
  isAmbiguous: boolean;
  candidates?: LocationCandidate[];
}

interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

interface OWGeoItem {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const OPENWEATHER_GEO_URL = 'http://api.openweathermap.org/geo/1.0/direct';
const GEOCODE_TIMEOUT_MS = 6_000;
const CACHE_TTL_SECONDS = 604_800; // 7 days

@Injectable()
export class LocationResolverService {
  private readonly logger = new Logger(LocationResolverService.name);
  private readonly openWeatherApiKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.openWeatherApiKey = configService.get<string>('OPENWEATHER_API_KEY', '');
  }

  /**
   * Resolves real-world places, landmarks, POIs, or city queries to coordinates.
   * Uses OpenStreetMap Nominatim for landmark/POI resolution, with OpenWeather direct geocoding fallback.
   */
  async resolveLocation(intent: WeatherIntentSchema): Promise<ResolvedLocationResult> {
    const queries = this.buildSearchQueries(intent);

    if (queries.length === 0) {
      throw new NotFoundException(
        'No valid location specified in prompt. Please mention a place or city name.',
      );
    }

    this.logger.log(
      `[LocationResolver] Resolving place for target="${intent.target_place || ''}", reference="${intent.nearby_reference || ''}", raw="${intent.location || ''}"`,
    );

    for (const query of queries) {
      const cacheKey = `geo:resolved:${query.toLowerCase()}`;

      // 1. Redis Cache Lookup
      try {
        const cached = await this.redis.get<ResolvedLocationResult>(cacheKey);
        if (cached) {
          this.logger.log(
            `[LocationResolver] CACHE HIT for "${query}" -> (${cached.lat}, ${cached.lon}) - ${cached.displayName}`,
          );
          return cached;
        }
      } catch (err: any) {
        this.logger.warn(`[LocationResolver] Redis get failed for ${cacheKey}: ${err?.message}`);
      }

      // 2. Nominatim Geocoding Lookup (Landmarks, POIs, Parks, Temples, Cities)
      const nominatimResults = await this.queryNominatim(query);
      if (nominatimResults && nominatimResults.length > 0) {
        const resolved = this.formatNominatimResults(query, nominatimResults);
        this.logger.log(
          `[LocationResolver] NOMINATIM RESOLVED "${query}" -> (${resolved.lat}, ${resolved.lon}) - ${resolved.displayName}`,
        );
        this.cacheResult(cacheKey, resolved);
        return resolved;
      }

      // 3. OpenWeather Direct Geocoding Fallback
      const owResults = await this.queryOpenWeather(query);
      if (owResults && owResults.length > 0) {
        const resolved = this.formatOpenWeatherResults(query, owResults);
        this.logger.log(
          `[LocationResolver] OPENWEATHER RESOLVED "${query}" -> (${resolved.lat}, ${resolved.lon}) - ${resolved.displayName}`,
        );
        this.cacheResult(cacheKey, resolved);
        return resolved;
      }
    }

    const failedQuery = queries[0];
    this.logger.warn(`[LocationResolver] Failed to resolve location for query: "${failedQuery}"`);
    throw new NotFoundException(
      `Could not resolve real-world location for "${intent.target_place || intent.location || failedQuery}". Please check the place name or specify a nearby city.`,
    );
  }

  /**
   * Generates prioritized search query candidates based on Gemini entity extraction.
   */
  private buildSearchQueries(intent: WeatherIntentSchema): string[] {
    const queries: string[] = [];

    const target = intent.target_place?.trim();
    const reference = intent.nearby_reference?.trim();
    const rawLoc = intent.location?.trim();
    const country = intent.country?.trim();

    // Query 1: Landmark + Reference City (e.g. "Sun Temple, Mehsana")
    if (target && reference && target.toLowerCase() !== reference.toLowerCase()) {
      queries.push(country ? `${target}, ${reference}, ${country}` : `${target}, ${reference}`);
    }

    // Query 2: Target place directly (e.g. "Sun Temple" or "Ahmedabad")
    if (target) {
      queries.push(country ? `${target}, ${country}` : target);
    }

    // Query 3: Combined location string
    if (rawLoc && !queries.includes(rawLoc)) {
      queries.push(rawLoc);
    }

    // Query 4: Reference city fallback (e.g. "Mehsana")
    if (reference && !queries.includes(reference)) {
      queries.push(country ? `${reference}, ${country}` : reference);
    }

    return Array.from(new Set(queries.filter((q) => q && q.length > 1)));
  }

  /**
   * Queries OpenStreetMap Nominatim API for POI / Landmark / Place resolution.
   */
  private async queryNominatim(query: string): Promise<NominatimResult[] | null> {
    try {
      this.logger.log(`[LocationResolver] Querying Nominatim for: "${query}"`);
      const response = await firstValueFrom(
        this.http
          .get<NominatimResult[]>(NOMINATIM_BASE_URL, {
            params: {
              q: query,
              format: 'json',
              addressdetails: 1,
              limit: 5,
            },
            headers: {
              'User-Agent': 'WeatherGPT-GIS/1.0 (contact@weathergpt.app)',
            },
          })
          .pipe(
            timeout(GEOCODE_TIMEOUT_MS),
            catchError((err: AxiosError | TimeoutError | Error) => {
              this.logger.warn(`Nominatim request warning for "${query}": ${err.message}`);
              return throwError(() => err);
            }),
          ),
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
      return null;
    } catch (err) {
      this.logger.warn(`[LocationResolver] Nominatim query failed for "${query}". Proceeding to fallback.`);
      return null;
    }
  }

  /**
   * Queries OpenWeather Direct Geocoding API as backup geocoder.
   */
  private async queryOpenWeather(query: string): Promise<OWGeoItem[] | null> {
    if (!this.openWeatherApiKey) return null;

    try {
      this.logger.log(`[LocationResolver] Querying OpenWeather Geocode for: "${query}"`);
      const response = await firstValueFrom(
        this.http
          .get<OWGeoItem[]>(OPENWEATHER_GEO_URL, {
            params: {
              q: query,
              limit: 5,
              appid: this.openWeatherApiKey,
            },
          })
          .pipe(
            timeout(GEOCODE_TIMEOUT_MS),
            catchError((err) => throwError(() => err)),
          ),
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
      return null;
    } catch (err) {
      this.logger.warn(`[LocationResolver] OpenWeather direct geocoding failed for "${query}".`);
      return null;
    }
  }

  /**
   * Formats Nominatim results and checks for ambiguity across top candidates.
   */
  private formatNominatimResults(
    query: string,
    results: NominatimResult[],
  ): ResolvedLocationResult {
    const primary = results[0];
    const lat = parseFloat(primary.lat);
    const lon = parseFloat(primary.lon);

    const countryCode = primary.address?.country_code
      ? primary.address.country_code.toUpperCase()
      : 'GLOBAL';

    const cityOrTown =
      primary.address?.city ||
      primary.address?.town ||
      primary.address?.village ||
      primary.address?.suburb ||
      primary.address?.county ||
      '';

    let shortName = primary.display_name.split(',')[0].trim();
    if (cityOrTown && !shortName.toLowerCase().includes(cityOrTown.toLowerCase())) {
      shortName = `${shortName}, ${cityOrTown}`;
    }

    const candidates: LocationCandidate[] = results.map((r) => ({
      name: r.display_name.split(',')[0].trim(),
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      country: r.address?.country_code ? r.address.country_code.toUpperCase() : '',
      state: r.address?.state,
      type: r.type,
    }));

    // Ambiguity detection: If top 2 results belong to different states or countries
    const isAmbiguous =
      candidates.length > 1 &&
      candidates[0].country !== candidates[1].country &&
      candidates[0].state !== candidates[1].state;

    return {
      name: shortName,
      displayName: primary.display_name,
      lat,
      lon,
      country: countryCode,
      isAmbiguous,
      candidates: isAmbiguous ? candidates : undefined,
    };
  }

  /**
   * Formats OpenWeather direct geocoding results.
   */
  private formatOpenWeatherResults(
    query: string,
    results: OWGeoItem[],
  ): ResolvedLocationResult {
    const primary = results[0];
    const name = primary.state ? `${primary.name}, ${primary.state}` : primary.name;

    const candidates: LocationCandidate[] = results.map((r) => ({
      name: r.name,
      displayName: r.state ? `${r.name}, ${r.state}, ${r.country}` : `${r.name}, ${r.country}`,
      lat: r.lat,
      lon: r.lon,
      country: r.country,
      state: r.state,
    }));

    const isAmbiguous =
      candidates.length > 1 &&
      candidates[0].country !== candidates[1].country;

    return {
      name,
      displayName: candidates[0].displayName,
      lat: primary.lat,
      lon: primary.lon,
      country: primary.country,
      isAmbiguous,
      candidates: isAmbiguous ? candidates : undefined,
    };
  }

  private cacheResult(cacheKey: string, result: ResolvedLocationResult): void {
    this.redis
      .set(cacheKey, result, CACHE_TTL_SECONDS)
      .catch((err: Error) =>
        this.logger.warn(`Failed to cache location resolution for ${cacheKey}: ${err.message}`),
      );
  }
}
