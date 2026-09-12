def generate_response(
    city,
    prediction,
    confidence,
    temperature,
    humidity,
    wind
):
    # Weather emojis
    emoji = {
        "Sunny": "☀️",
        "Cloudy": "☁️",
        "Rainy": "🌧️",
        "Stormy": "⛈️"
    }

    # Weather advice
    advice = {
        "Sunny": "Perfect weather for outdoor activities. Don't forget sunscreen.",
        "Cloudy": "The sky may remain overcast. Carry a light jacket.",
        "Rainy": "Carry an umbrella and avoid slippery roads.",
        "Stormy": "Strong winds and heavy rain are expected. Avoid unnecessary travel."
    }

    # Clothing suggestions
    if temperature >= 35:
        clothing = "Light cotton clothes are recommended."
    elif temperature >= 20:
        clothing = "Comfortable casual clothing is suitable."
    else:
        clothing = "Wear a jacket or warm clothing."

    # Outdoor score
    outdoor_score = {
        "Sunny": "9/10",
        "Cloudy": "7/10",
        "Rainy": "4/10",
        "Stormy": "1/10"
    }

    return f"""{emoji[prediction]} **WeatherGPT**

Here's your weather update for **{city}**.

**Weather:** {prediction}
**Confidence:** {confidence}%

### Current Conditions
- 🌡️ Temperature: {temperature}°C
- 💧 Humidity: {humidity}%
- 🌬️ Wind Speed: {wind} m/s

### AI Travel Advice
{advice[prediction]}

### Clothing Recommendation
👕 {clothing}

### Outdoor Activity Score
⭐ {outdoor_score[prediction]}

Have a safe trip! 🌍
"""