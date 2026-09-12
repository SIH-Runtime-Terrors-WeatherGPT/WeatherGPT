# WeatherGPT NestJS Backend

A production-ready NestJS backend for WeatherGPT integrating Google Gemini API, OpenWeather API, Redis caching, MongoDB with Prisma ORM, and JWT authentication.

---

## Technology Stack

- **Framework**: NestJS v10 (TypeScript Node.js Enterprise Framework)
- **Database**: MongoDB with Prisma ORM
- **In-Memory Cache**: Redis (`ioredis`) for 7-day geocode & 30-min weather forecast caching
- **AI Models & Engines**:
  - Google Gemini API (`gemini-1.5-flash`) for NLU Intent Extraction & Fallback Recommendation
  - Local Ollama LLM (`llama3.2`) for Grounded Natural-Language Advisory Generation
- **External Data Provider**: OpenWeather Geocoding & 5-Day/3-Hour Weather Forecast APIs
- **Authentication**: Passport.js JWT strategy & bcryptjs password hashing

---

## Prerequisites

Ensure the following services are installed and running locally on your developer machine:

- **Node.js**: `v20` or higher
- **MongoDB**: Running locally at `mongodb://localhost:27017`
- **Redis**: Running locally at `redis://localhost:6379`

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to create `.env`:

```bash
cp .env.example .env
```

Fill in your active API keys in `.env`:

```env
NODE_ENV=development
PORT=5000

FRONTEND_URL=http://localhost:5173

DATABASE_URL=mongodb://localhost:27017/weathergpt?directConnection=true

REDIS_URL=redis://localhost:6379
WEATHER_CACHE_TTL=1800

GEMINI_API_KEY=your_google_gemini_api_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here

JWT_SECRET=your_strong_jwt_secret_here
JWT_EXPIRES_IN=1d
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

---

## Running the Application (Local Development without Docker)

### Start in Development Mode:

```bash
npm run start:dev
```

The server will start on port 5000: `http://localhost:5000`.

### Verify Health Check:

```bash
curl http://localhost:5000/health
```

Expected Response:
```json
{
  "status": "ok"
}
```

---

## Running Unit Tests

```bash
npm test
```

---

## Project Structure

```
src/
├── main.ts
├── app.module.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/
│   │   ├── register.dto.ts
│   │   └── login.dto.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   └── strategies/
│       └── jwt.strategy.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   └── users.service.ts
│
├── chat/
│   ├── chat.module.ts
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   └── dto/
│       ├── create-chat-message.dto.ts
│       └── get-history-query.dto.ts
│
├── gemini/
│   ├── gemini.module.ts
│   ├── gemini.service.ts
│   └── dto/
│       └── extracted-nlu-query.dto.ts
│
├── weather/
│   ├── weather.module.ts
│   ├── weather.service.ts
│   └── weather.types.ts
│
├── cache/
│   ├── cache.module.ts
│   └── redis.service.ts
│
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
└── common/
    ├── common.module.ts
    ├── filters/
    │   └── all-exceptions.filter.ts
    ├── decorators/
    │   └── current-user.decorator.ts
    └── services/
        └── date-resolver.service.ts
```
