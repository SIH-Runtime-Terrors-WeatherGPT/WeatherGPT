# WeatherGPT — Project Documentation ☀️🌧️

**Smart India Hackathon 2026 (SIH 2026)**  
**Project Name:** WeatherGPT  
**Category:** Disaster Management & Climate Decision Support System  

---

## Executive Summary

**WeatherGPT** is a conversational AI platform designed for weather forecasting, climate alerts, agricultural decision support, and outdoor planning. 

Traditional weather applications present complex numerical tables and raw meteorological charts that require manual interpretation. WeatherGPT allows users to ask natural-language questions (e.g., *"Should I carry an umbrella in Ahmedabad tomorrow evening?"* or *"Will tomorrow be suitable for a cricket match in Surat?"*). The system processes the query, retrieves real-time weather facts from OpenWeather, applies Redis caching, and uses a local Ollama LLM (`llama3.2`) combined with Google Gemini to generate actionable natural-language responses.

---

## 1. System Architecture

```
                  ┌──────────────────────────────────────────────────┐
                  │          WeatherGPT Desktop / Mobile UI          │
                  │   - Next.js 16 + React 19 + Tailwind CSS         │
                  │   - Interactive Satellite Leaflet Map (68% W)    │
                  │   - AI Chatbot Copilot Panel (32% W)             │
                  └────────────────────────┬─────────────────────────┘
                                           │
                                           │ POST /weather/chat (Bearer JWT)
                                           ▼
                  ┌──────────────────────────────────────────────────┐
                  │              NestJS Backend Gateway              │
                  └───────┬──────────────────────────────────┬───────┘
                          │                                  │
      1. Extract Intent   │                                  │ 5. Generate Answer
                          ▼                                  ▼
         ┌──────────────────────────┐               ┌──────────────────────────┐
         │     Google Gemini API    │               │     Ollama Local API     │
         │   (gemini-1.5-flash)     │               │        (llama3.2)       │
         │  Natural Language NLU    │               │ Grounded Natural Response│
         └────────────┬─────────────┘               └────────────▲─────────────┘
                      │                                          │
                      │ 2. Intent JSON & Resolved Date           │ 4. Normalized Data
                      ▼                                          │
         ┌──────────────────────────┐               ┌────────────┴─────────────┐
         │   DateResolverService    │               │      WeatherService      │
         │ ("tomorrow" -> YYYY-MM-DD)│               │  Data Normalization Engine│
         └────────────┬─────────────┘               └────────────▲─────────────┘
                      │                                          │
                      │ 3. Check Redis / Fetch OpenWeather       │
                      ▼                                          │
         ┌──────────────────────────┐               ┌────────────┴─────────────┐
         │       Redis Cache        ├───────────────►    OpenWeather API       │
         │ (geo:<loc> & forecast)   │  Cache Miss   │ (Geocode & 5-Day Forecast│
         └──────────────────────────┘               └──────────────────────────┘
                                                                 │
                                                                 ▼
                                                    ┌──────────────────────────┐
                                                    │    MongoDB (Prisma ORM)  │
                                                    │ Users, Sessions, History │
                                                    └──────────────────────────┘
```

---

## 2. Core Operational Pipeline

Each user question follows a strict 9-step execution pipeline:

1. **Authentication & Validation**: JWT token is validated; `userId` is extracted exclusively from the token payload.
2. **NLU Intent Extraction**: Prompt is sent to `GeminiService`. Gemini returns a structured JSON schema:
   ```json
   {
     "location": "Ahmedabad",
     "country": "India",
     "intent": "forecast",
     "date": "tomorrow",
     "time_period": "evening",
     "requested_data": ["rain", "precipitation_probability"],
     "activity": "carrying umbrella"
   }
   ```
3. **Location Validation**: Backend validates that `location` is non-empty. If ambiguous or missing, a HTTP 400 response prompts clarification.
4. **Date & Time Resolution**: `DateResolverService` converts natural date terms (`today`, `tomorrow`, `this weekend`, `next Monday`) to ISO calendar dates (`YYYY-MM-DD`) based on server time.
5. **Geocoding & Redis Caching**:
   - Geocode lookup (`geo:<location>:<country>`) checks Redis.
   - On cache miss, calls OpenWeather Geocoding API (`http://api.openweathermap.org/geo/1.0/direct`).
   - Caches coordinate result for 7 days (`604800s`).
6. **Weather Retrieval & Normalization**:
   - Weather lookup (`weather:forecast:<lat>:<lon>:<date>`) checks Redis.
   - On cache miss, fetches current weather & 5-day/3-hour forecast from OpenWeather.
   - Normalizes data into a standardized `WeatherData` structure (Temperature, High/Low, Rain probability, Condition, Wind speed, Humidity).
   - Caches forecast data in Redis for 30 minutes (`1800s`).
7. **Conversational Answer Generation**:
   - Sends prompt + normalized OpenWeather facts to local Ollama API (`llama3.2`).
   - If Ollama is offline or times out, seamlessly falls back to `GeminiService.generatePracticalRecommendation`.
   - **Crucial Rule:** LLM is strictly forbidden from inventing weather values beyond supplied OpenWeather facts.
8. **Database Persistence**: Message stream, structured intent, and weather summary are persisted to MongoDB via Prisma ORM under `Conversation` and `ChatHistory`.
9. **Frontend Sync**: Returns answer, intent, location coordinates, and normalized weather object to Next.js UI. The frontend auto-centers the Leaflet Satellite Map, updates the marker, and switches overlay layer.

---

## 3. Comprehensive Technology Stack & Module Breakdown

### 3.1 Technology Stack Matrix

| Technology Layer | Core Tech / Library | Purpose & Implementation Details |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router) + React 19 | SSR & Client-side rendering, layout route groups, optimized bundle serving. |
| **Frontend Styling** | Tailwind CSS + Glassmorphism UI | Sleek dark-mode theme, blur dynamic glows, reactive layout grids. |
| **Interactive Mapping** | Leaflet.js + React-Leaflet | High-performance interactive weather GIS with OpenStreetMap base layer. |
| **Satellite Weather Layers**| OpenWeather Tile API | Live color overlay tiles: Rain (`precipitation_new`), Temp (`temp_new`), Wind (`wind_new`), Clouds (`clouds_new`), Pressure (`pressure_new`). |
| **Backend Framework** | NestJS v10 | Enterprise modular Node.js API Gateway, controllers, services, guards, and interceptors. |
| **Language** | TypeScript v5 | End-to-end static typing, DTO interfaces, strict compiler options. |
| **Authentication & Security**| Passport.js + JWT + bcryptjs | Stateless Bearer token authentication, 12-round salt password hashing, route guards. |
| **Intent Extraction NLU** | Google Gemini API (`gemini-1.5-flash`) | Structured JSON extraction from raw natural-language user queries. |
| **Response Generation LLM** | Ollama (`llama3.2`) Local Model | Local LLM running on port 11434 generating decision support answers strictly grounded in OpenWeather data. |
| **AI Resilience Engine** | Google Gemini Fallback | Automatic failover to Gemini `generatePracticalRecommendation` if local Ollama model is offline. |
| **Weather & Geocode Source**| OpenWeather REST APIs | Authoritative real-time weather facts (Geocoding API & 5-Day/3-Hour Forecast API). |
| **Primary Database** | MongoDB + Prisma ORM | Scalable MongoDB document database managed via Prisma ORM for User, Conversation, and Message records. |
| **High-Performance Caching**| Redis (`ioredis`) | In-memory key-value cache with dual TTL policies (7-day geocode cache, 30-min forecast cache). |

### 3.2 Backend Module Architecture (`/BackEnd`)
- `AuthModule`: Registration, authentication, bcrypt password hashing, JWT issue/verify.
- `UsersModule`: Profile lookup & identity management.
- `WeatherModule`: Main pipeline orchestrator (`WeatherService`, `WeatherController`).
- `GeminiModule`: NLU intent extraction (`gemini-1.5-flash`).
- `OllamaModule`: Natural-language answer generation (`llama3.2`).
- `RedisModule`: High-performance caching service (`RedisProvider`).
- `ConversationsModule`: Session & message history persistence.
- `PrismaModule`: MongoDB database modeling & client connection.

### 3.3 Frontend Component Architecture (`/front_end`)
- **Interactive Leaflet Map (`WeatherMap.tsx`)**: SSR-safe dynamic map with OpenStreetMap base layer and OpenWeather tile overlays.
- **Layer Control Widget (`WeatherLayerControl.tsx`)**: Floating overlay layer switcher (Rain, Temp, Wind, Clouds, Pressure).
- **Dynamic Legend (`WeatherLegend.tsx`)**: Color gradient legend displaying intensity scales.
- **AI Chat Copilot (`ChatPanel.tsx`)**: Scrollable message stream with markdown formatting and location markers.

---

## 4. Weather Intensity Color Gradients

| Layer | Low Intensity | Medium Intensity | High / Extreme Intensity | Scale Range |
| :--- | :--- | :--- | :--- | :--- |
| **Rain / Precipitation** | Light Blue (`0.1 mm/h`) | Green / Yellow (`5-15 mm/h`) | Orange / Dark Red / Purple (`50+ mm/h`) | `0.1` to `50+ mm/h` |
| **Temperature** | Deep Blue (`-20°C`) | Cyan / Green / Yellow (`15-25°C`) | Orange / Bright Red (`45°C`) | `-20°C` to `45°C` |
| **Wind Speed** | Light Cyan (`0 km/h`) | Teal / Yellow (`30-50 km/h`) | Orange / Dark Rose (`100+ km/h`) | `0` to `100+ km/h` |
| **Clouds** | Transparent (`0%`) | Semi-transparent Gray (`50%`) | Solid White/Gray (`100%`) | `0%` to `100%` |
| **Pressure** | Purple (`950 hPa`) | Green (`1013 hPa`) | Red (`1050 hPa`) | `950` to `1050 hPa` |

---

## 5. Security & Fault Tolerance

1. **API Key Isolation**: `GEMINI_API_KEY`, `OPENWEATHER_API_KEY`, `JWT_SECRET`, and MongoDB connection strings exist **exclusively on the NestJS backend**. Browser never sees secrets.
2. **User Isolation**: Chat history endpoints (`GET /api/conversations`) scope queries strictly to `req.user.id`. User A can never inspect User B's records.
3. **Resilience & Fallbacks**:
   - **Ollama Offline**: Automatically falls back to Gemini `generatePracticalRecommendation`. Live judge demos will never fail due to local LLM state.
   - **Redis Connection Refused**: Gracefully logs warning and continues directly to OpenWeather API.
   - **Database Persistence Warning**: Non-blocking; query still completes and returns weather answer to user.

---

## 6. Live Demonstration Guide for SIH 2026 Judges

Follow these steps during your hackathon presentation:

1. **Launch App**: Open `http://localhost:3000` (or `http://localhost:5173`).
2. **Login / Register**: Create account and log in.
3. **Ask Rain & Umbrella Question**:
   - Prompt: *"Should I carry an umbrella in Ahmedabad tomorrow evening?"*
   - Observe: Chatbot gives recommendation ("68% chance of rain..."). The map auto-centers on Ahmedabad, drops marker, and activates the **Rain Overlay**.
4. **Ask Activity Suitability**:
   - Prompt: *"Will tomorrow's weather be suitable for a cricket match in Surat?"*
   - Observe: Conversational decision support response based on temperature, wind, and rain probabilities.
5. **Demonstrate GIS Map Controls**:
   - Toggle layers using the top-right overlay control: Rain $\rightarrow$ Temperature $\rightarrow$ Wind $\rightarrow$ Clouds $\rightarrow$ Pressure.
   - Observe the dynamic legend updating at bottom-left.
   - Click the navigation button to center on browser location.
