export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  errors: string[] | null;
  timestamp: string;
}

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  savedLocations?: string[];
  preferences?: {
    tempUnit: 'celsius' | 'fahrenheit';
    windUnit: 'kmh' | 'mph';
    notifications: boolean;
  };
}

export interface WeatherData {
  city: string;
  country: string;
  coordinates: { lat: number; lon: number };
  current: {
    temp: number;
    feelsLike: number;
    condition: string;
    description: string;
    humidity: number;
    windSpeed: number;
    pressure: number;
    uvIndex: number;
    airQuality: { aqi: number; status: string };
    updatedAt: string;
  };
}

export interface ForecastDay {
  day: string;
  date: string;
  tempMax: number;
  tempMin: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  precipitationProbability: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  locationContext?: {
    city: string;
    country: string;
    temp: number;
    condition: string;
  };
  timestamp: string;
}