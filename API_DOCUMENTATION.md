# WeatherGPT — REST API Documentation 📖

**Version:** 1.0.0  
**Base URL:** `http://localhost:5000`  
**Authentication:** Bearer JWT Token in `Authorization` header  

---

## Table of Contents
1. [Authentication Endpoints](#1-authentication-endpoints)
   - [POST /api/auth/register](#post-apiauthregister)
   - [POST /api/auth/login](#post-apiauthlogin)
   - [GET /api/auth/me](#get-apiauthme)
2. [WeatherGPT Conversational Chat API](#2-weathergpt-conversational-chat-api)
   - [POST /weather/chat](#post-weatherchat)
   - [GET /weather/city/:city](#get-weathercitycity)
3. [Conversations & Chat History API](#3-conversations--chat-history-api)
   - [GET /api/conversations](#get-apiconversations)
   - [GET /api/conversations/:id](#get-apiconversationsid)
   - [POST /api/conversations](#post-apiconversations)
   - [DELETE /api/conversations/:id](#delete-apiconversationsid)
4. [System Health Check](#4-system-health-check)
   - [GET /health](#get-health)
5. [Standard Error Responses](#5-standard-error-responses)

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates a new user account and returns a JWT authentication token.

- **Auth Required:** No
- **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Password123!"
}
```

#### Response (`201 Created`):
```json
{
  "user": {
    "id": "66e2c3a9f1a2b3c4d5e6f7a8",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "createdAt": "2026-09-12T17:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `POST /api/auth/login`
Authenticates user credentials and returns a JWT token.

- **Auth Required:** No
- **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```

#### Response (`200 OK`):
```json
{
  "user": {
    "id": "66e2c3a9f1a2b3c4d5e6f7a8",
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `GET /api/auth/me`
Retrieves profile details for the currently authenticated user.

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)

#### Response (`200 OK`):
```json
{
  "id": "66e2c3a9f1a2b3c4d5e6f7a8",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "createdAt": "2026-09-12T17:00:00.000Z"
}
```

---

## 2. WeatherGPT Conversational Chat API

### `POST /weather/chat`
*(Also accessible at `POST /api/weather/chat` and `POST /api/chat`)*

Main WeatherGPT processing pipeline. Accepts a natural-language prompt, extracts structured weather intent via Google Gemini, resolves dates, checks Redis cache, fetches OpenWeather data, generates natural-language answer via Ollama (or Gemini fallback), and persists conversation history in MongoDB.

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)
- **Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "prompt": "Should I carry an umbrella in Ahmedabad tomorrow evening?",
  "conversationId": "66e2c3a9f1a2b3c4d5e6f7a9" 
}
```
*(Note: `conversationId` is optional. If omitted, a new conversation session will automatically be created.)*

#### Response (`200 OK`):
```json
{
  "answer": "There is a 68% chance of precipitation in Ahmedabad tomorrow evening, with light rain expected. Carrying an umbrella would be advisable.",
  "intent": {
    "location": "Ahmedabad",
    "country": "India",
    "intent": "forecast",
    "date": "tomorrow",
    "time_period": "evening",
    "requested_data": [
      "rain",
      "precipitation_probability",
      "temperature"
    ],
    "activity": "carrying umbrella"
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
  "conversationId": "66e2c3a9f1a2b3c4d5e6f7a9"
}
```

---

### `GET /weather/city/:city`
Public endpoint to fetch current weather summary for a specific city.

- **Auth Required:** No

#### Example Request:
`GET /weather/city/Mumbai`

#### Response (`200 OK`):
```json
{
  "location": "Mumbai, IN",
  "date": "2026-09-12",
  "temperature": 29.5,
  "temperatureHigh": 31,
  "temperatureLow": 27,
  "rainProbability": 20,
  "condition": "scattered clouds",
  "windSpeed": 5.1,
  "humidity": 78
}
```

---

## 3. Conversations & Chat History API

### `GET /api/conversations`
Retrieves all conversation sessions for the authenticated user (sorted newest first).

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)

#### Response (`200 OK`):
```json
[
  {
    "id": "66e2c3a9f1a2b3c4d5e6f7a9",
    "userId": "66e2c3a9f1a2b3c4d5e6f7a8",
    "title": "Ahmedabad Weather",
    "createdAt": "2026-09-12T17:05:00.000Z",
    "updatedAt": "2026-09-12T17:05:10.000Z",
    "messages": [
      {
        "id": "msg-1",
        "role": "user",
        "content": "Should I carry an umbrella in Ahmedabad tomorrow evening?",
        "createdAt": "2026-09-12T17:05:00.000Z"
      },
      {
        "id": "msg-2",
        "role": "assistant",
        "content": "There is a 68% chance of precipitation in Ahmedabad tomorrow evening...",
        "createdAt": "2026-09-12T17:05:02.000Z"
      }
    ]
  }
]
```

---

### `GET /api/conversations/:id`
Retrieves a single conversation session with full message history.

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)

---

### `POST /api/conversations`
Creates a new conversation session for the authenticated user.

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)

#### Request Body:
```json
{
  "title": "Surat Trip Weather"
}
```

---

### `DELETE /api/conversations/:id`
Deletes a conversation session belonging to the authenticated user.

- **Auth Required:** Yes (`Authorization: Bearer <JWT_TOKEN>`)

---

## 4. System Health Check

### `GET /health`
Exposes system readiness and service health status.

- **Auth Required:** No

#### Response (`200 OK`):
```json
{
  "status": "ok",
  "timestamp": "2026-09-12T17:10:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "gemini": "configured",
    "openweather": "configured",
    "ollama": "reachable"
  }
}
```

---

## 5. Standard Error Responses

All NestJS exceptions return consistent JSON payloads:

### Bad Request (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": "Could not identify location in your prompt. Please specify a city or place name.",
  "error": "Bad Request"
}
```

### Unauthorized (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Unauthorized: Invalid or expired JWT token",
  "error": "Unauthorized"
}
```

### Resource Not Found (`404 Not Found`)
```json
{
  "statusCode": 404,
  "message": "Location \"XYZABC\" was not found. Please verify the place name.",
  "error": "Not Found"
}
```

### Service Unavailable (`503 Service Unavailable`)
```json
{
  "statusCode": 503,
  "message": "Weather service is temporarily unavailable.",
  "error": "Service Unavailable"
}
```
