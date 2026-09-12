# WeatherGPT — Backend API Documentation

This document describes the API endpoints, environment variables, authentication mechanisms, and system architecture for the WeatherGPT NestJS backend.

---

## Environment Variables

The backend relies on the following environment variables (defined in `.env`):

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Application environment | `development` |
| `PORT` | HTTP server port | `5000` |
| `FRONTEND_URL` | Restricted CORS origin URL | `http://localhost:5173` |
| `DATABASE_URL` | MongoDB connection URI | `mongodb://localhost:27017/weathergpt` |
| `REDIS_URL` | Redis server connection URL | `redis://localhost:6379` |
| `WEATHER_CACHE_TTL` | Weather cache TTL in seconds | `1800` |
| `GEMINI_API_KEY` | Google Gemini API Key | Secret |
| `OPENWEATHER_API_KEY` | OpenWeather API Key | Secret |
| `JWT_SECRET` | Secret key for signing JWT tokens | Secret |
| `JWT_EXPIRES_IN` | JWT token expiration duration | `1d` |

---

## Authentication

Endpoints marked as **Protected** require a valid JWT Bearer token passed in the HTTP `Authorization` header:

```http
Authorization: Bearer <your_jwt_access_token>
```

If the token is missing, expired, or invalid, the backend returns `401 Unauthorized`.

---

## Endpoints Summary

### 1. Health Check
`GET /health`

- **Auth Required**: None
- **Headers**: None
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### 2. User Registration
`POST /api/auth/register`

- **Auth Required**: None
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Dhruv",
    "email": "dhruv@example.com",
    "password": "password123"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "id": "66e2c2f1a9b1c2d3e4f5a6b7",
    "name": "Dhruv",
    "email": "dhruv@example.com"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (missing name/email/password or password under 8 characters)
  - `409 Conflict`: Account with this email already exists

---

### 3. User Login
`POST /api/auth/login`

- **Auth Required**: None
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "dhruv@example.com",
    "password": "password123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "66e2c2f1a9b1c2d3e4f5a6b7",
      "name": "Dhruv",
      "email": "dhruv@example.com"
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Invalid email or password

---

### 4. Authenticated User Profile
`GET /api/users/me`

- **Auth Required**: Yes (JWT Bearer token)
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "id": "66e2c2f1a9b1c2d3e4f5a6b7",
    "name": "Dhruv",
    "email": "dhruv@example.com"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Missing or invalid JWT
  - `404 Not Found`: User no longer exists

---

### 5. WeatherGPT Chat Query
`POST /api/chat`

- **Auth Required**: Yes (JWT Bearer token)
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "message": "Will tomorrow be good for going to an amusement park in London?"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "id": "66e2c2f1a9b1c2d3e4f5a6b7",
    "message": "Tomorrow looks suitable for an amusement park visit in London. The temperature should be comfortable around 21°C with a low 20% chance of rain. Carry a light jacket for the evening.",
    "request": {
      "location": "London",
      "date": "2026-09-13",
      "activity": "amusement park",
      "intent": "activity_weather_recommendation"
    },
    "weather": {
      "temperature": 21,
      "temperatureHigh": 23,
      "temperatureLow": 15,
      "rainProbability": 20,
      "condition": "Partly cloudy",
      "windSpeed": 12,
      "humidity": 60
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing message or location could not be extracted
  - `401 Unauthorized`: Missing or invalid JWT
  - `429 Too Many Requests`: Gemini API rate limit exceeded
  - `502 Bad Gateway`: OpenWeather or Gemini API unavailable
  - `504 Gateway Timeout`: OpenWeather or Gemini API timeout

---

### 6. User Chat History
`GET /api/chat/history`

- **Auth Required**: Yes (JWT Bearer token)
- **Query Parameters**:
  - `page` (optional, default: 1)
  - `limit` (optional, default: 20, max: 100)
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "history": [
      {
        "id": "66e2c2f1a9b1c2d3e4f5a6b7",
        "originalMessage": "Will tomorrow be good for going to an amusement park in London?",
        "structuredRequest": {
          "location": "London",
          "date": "2026-09-13",
          "activity": "amusement park",
          "intent": "activity_weather_recommendation"
        },
        "weatherSummary": {
          "temperature": 21,
          "temperatureHigh": 23,
          "temperatureLow": 15,
          "rainProbability": 20,
          "condition": "Partly cloudy",
          "windSpeed": 12,
          "humidity": 60
        },
        "answer": "Tomorrow looks suitable for an amusement park visit in London...",
        "createdAt": "2026-09-12T16:06:20.123Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Missing or invalid JWT
