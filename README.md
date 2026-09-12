# WeatherGPT ⛅🤖

**Smart India Hackathon 2026 (SIH 2026)**
Conversational AI Platform for Weather Forecasting, Alerts, Climate Information, and Decision Support.

---

## 1. Project Overview

**WeatherGPT** is an intelligent, conversational weather assistant that understands natural-language queries, extracts structured weather parameters, fetches real-time data from OpenWeather, and generates grounded, practical natural-language recommendations using Ollama (with Google Gemini fallback).

### Key Features
- **Natural Language Intent Extraction**: Google Gemini converts questions into structured intent (location, intent, relative date/time, requested parameters, activity).
- **Date & Time Resolution**: Internal `DateResolverService` resolves relative date expressions like `today`, `tomorrow`, `this weekend`, `next Monday` using local server time.
- **Authoritative Weather Facts**: Real-time geocoding and forecast data sourced strictly from OpenWeather API (No LLM hallucinations).
- **Redis Caching Layer**: Geocoding (`geo:<location>:<country>`) cached for 7 days; forecast data (`weather:forecast:<lat>:<lon>:<date>`) cached for 30 minutes.
- **Conversational Decision Support**: Local Ollama LLM (`llama3.2`) formats final natural-language answers and actionable recommendations based strictly on supplied weather data.
- **Persistent Chat History**: User authentication (JWT + bcrypt) and conversation history stored in MongoDB via Prisma ORM.

---

## 2. Core Architecture

```
Frontend (Next.js 16 / React 19)
   │
   │ POST /weather/chat  { prompt: "..." }  (Bearer JWT)
   ▼
NestJS Backend API Gateway
   │
   ├─► 1. Google Gemini API
   │      └── Extract structured WeatherIntent JSON
   │
   ├─► 2. DateResolverService
   │      └── Resolve relative date ("tomorrow" -> "YYYY-MM-DD")
   │
   ├─► 3. Redis Cache Lookup
   │      ├── Geocode Cache (geo:<loc>:<country>)
   │      └── Weather Cache (weather:forecast:<lat>:<lon>:<date>)
   │
   ├─► 4. OpenWeather API (on cache miss)
   │      ├── Geocoding API (City -> lat/lon)
   │      └── Weather & 5-Day/3-Hour Forecast API
   │
   ├─► 5. Ollama Local API (llama3.2)
   │      └── Generate natural-language answer grounded in OpenWeather data
   │          (Seamless fallback to Gemini if Ollama is offline)
   │
   └─► 6. MongoDB Persistence (via Prisma)
          └── Store User, Conversation, Message, and ChatHistory
```

---

## 3. Technology Stack

### 🎨 Frontend Architecture
- **Framework**: Next.js 16 (App Router with Turbopack), React 19
- **Language**: TypeScript (Strict Mode)
- **Styling & UI**: Tailwind CSS, Glassmorphism design system, Lucide React Icons
- **Interactive GIS & Mapping**: Leaflet.js, React-Leaflet, OpenStreetMap base layer
- **Weather Overlays**: Live OpenWeather tile layers (`precipitation_new`, `temp_new`, `wind_new`, `clouds_new`, `pressure_new`)
- **State & HTTP**: Custom React Hooks (`useAuth`, `useChat`), native fetch client with automatic JWT Bearer token interceptor

### ⚙️ Backend Architecture
- **Framework**: NestJS v10 (Modular Enterprise Architecture)
- **Language**: TypeScript v5
- **Authentication & Security**: Passport.js JWT strategy, bcryptjs password hashing, class-validator DTO validation
- **Date & Time Intelligence**: Custom `DateResolverService` for resolving relative dates (`today`, `tomorrow`, `this weekend`, `next Monday`)
- **HTTP Engine**: `@nestjs/axios`, RxJS streams for OpenWeather & LLM API calls

### 🤖 Artificial Intelligence (Hybrid Dual-LLM Engine)
- **NLU Intent Extraction**: Google Gemini API (`gemini-1.5-flash`) for converting user questions into structured JSON
- **Grounded Response Generation**: Local Ollama LLM (`llama3.2`) running on `http://localhost:11434` for generating natural-language advisory grounded strictly in weather facts
- **Failover Resilience Engine**: Automatic fallback to Google Gemini `generatePracticalRecommendation` if Ollama is offline

### 🌐 Weather & GIS Data Provider
- **Geocoding & Forecast**: OpenWeather Geocoding API & 5-Day / 3-Hour Weather Forecast API
- **Satellite Map Tile Engine**: OpenWeather Map Tile API

### 💾 Storage & High-Performance Caching
- **Database**: MongoDB with Prisma ORM (User profiles, conversations, message history, intent metadata)
- **Caching**: Redis with dual TTL caching strategy:
  - Geocoding cache (`geo:<location>:<country>`): 7 Days (604,800s)
  - Forecast cache (`weather:forecast:<lat>:<lon>:<date>`): 30 Minutes (1,800s)

---

## 4. Environment Variables

### Backend (`BackEnd/.env`)
```env
NODE_ENV=development
PORT=5000

FRONTEND_URL=http://localhost:5173

DATABASE_URL=mongodb://localhost:27017/weathergpt

REDIS_URL=redis://localhost:6379
WEATHER_CACHE_TTL=1800

GEMINI_API_KEY=your_gemini_api_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=1d
```

### Frontend (`front_end/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 5. Prerequisites & Services Setup

### 1. Node.js & npm
Ensure Node.js `v18.x` or `v20.x` is installed.

### 2. MongoDB
Start local MongoDB server on port `27017`:
```bash
# Verify MongoDB connection
mongod --dbpath /path/to/data
```

### 3. Redis
Start local Redis server on port `6379`:
```bash
redis-server
```

### 4. Ollama Local LLM
1. Install Ollama from [ollama.com](https://ollama.com/).
2. Pull the default model (`llama3.2` or `mistral`):
```bash
ollama pull llama3.2
```
3. Start Ollama service:
```bash
ollama serve
```

---

## 6. Project Setup & Installation

### Backend Setup
```bash
cd BackEnd

# Install dependencies
npm install

# Generate Prisma client for MongoDB
npx prisma generate

# Push database schema to MongoDB
npx prisma db push

# Run unit tests (44 tests across 7 suites)
npm run test

# Build NestJS application
npm run build

# Start backend server
npm run start:dev
```
Backend runs on `http://localhost:5000`.

### Frontend Setup
```bash
cd front_end

# Install dependencies
npm install

# Build Next.js application
npm run build

# Start frontend dev server
npm run dev
```
Frontend runs on `http://localhost:3000` (or `http://localhost:5173`).

---

## 7. API Endpoints

### Authentication
- `POST /api/auth/register` - Create user account
- `POST /api/auth/login` - Authenticate user & return JWT token
- `GET /api/auth/me` - Get authenticated user profile

### WeatherGPT Chat
- `POST /weather/chat` (or `POST /api/weather/chat`) - Submit natural-language weather question (JWT required)

#### Example Request:
```json
POST /weather/chat
Headers:
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json

Body:
{
  "prompt": "Should I carry an umbrella in Ahmedabad tomorrow evening?"
}
```

#### Example Response:
```json
{
  "answer": "There is a 68% chance of precipitation in Ahmedabad tomorrow with light rain expected. Carrying an umbrella would be advisable.",
  "intent": {
    "location": "Ahmedabad",
    "country": "India",
    "intent": "forecast",
    "date": "tomorrow",
    "time_period": "evening",
    "requested_data": ["rain", "precipitation_probability"]
  },
  "location": {
    "name": "Ahmedabad",
    "country": "IN",
    "lat": 23.0225,
    "lon": 72.5714
  },
  "weather": {
    "location": "Ahmedabad, IN",
    "date": "2026-09-13",
    "temperature": 28,
    "temperatureHigh": 31,
    "temperatureLow": 24,
    "rainProbability": 68,
    "condition": "light rain",
    "windSpeed": 4.2,
    "humidity": 72
  },
  "conversationId": "66e2c..."
}
```

### Conversation Management
- `GET /api/conversations` - Retrieve user conversation list
- `GET /api/conversations/:id` - Retrieve conversation details
- `DELETE /api/conversations/:id` - Delete conversation

### System Health
- `GET /health` - Application health check

---

## 8. Demonstration Prompts for SIH 2026

Try asking WeatherGPT the following prompts during your demonstration:

1. **Current Weather Query**:
   > *"What's the weather in Ahmedabad right now?"*
2. **Rain Forecast & Umbrella Decision**:
   > *"Should I carry an umbrella in Ahmedabad tomorrow evening?"*
3. **Activity Recommendation**:
   > *"Will tomorrow's weather be suitable for a cricket match in Surat?"*
4. **Temperature & Wind Information**:
   > *"How hot will Delhi be tomorrow afternoon and how strong is the wind?"*
5. **Outdoor Planning**:
   > *"Will tomorrow be good for going to an amusement park in London?"*

---

## 9. Error Handling & Fallbacks

- **Ollama Offline**: Automatically falls back to Gemini `generatePracticalRecommendation` to ensure live demos never fail.
- **Redis Offline**: Gracefully logs warnings and falls back directly to OpenWeather API.
- **Invalid Location**: Returns clean HTTP 404 message requesting location clarification.
- **MongoDB Disconnection**: Query processing completes and returns live weather answer even if persistence warning occurs.
