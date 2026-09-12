import pandas as pd
import numpy as np
import joblib


MODEL_FILE = "models/rain_model.pkl"
FEATURE_FILE = "models/feature_columns.pkl"


def calculate_humidity(temperature_c, dewpoint_c):

    humidity = 100 * (
        np.exp(
            (17.625 * dewpoint_c) /
            (243.04 + dewpoint_c)
        )
        /
        np.exp(
            (17.625 * temperature_c) /
            (243.04 + temperature_c)
        )
    )

    return max(0, min(100, humidity))


def predict_rain(
    temperature_c,
    dewpoint_c,
    pressure_hpa,
    wind_speed,
    precipitation_mm,
    latitude,
    longitude,
    city="",
    country=""
):

    model = joblib.load(MODEL_FILE)

    features = joblib.load(FEATURE_FILE)

    humidity = calculate_humidity(
        temperature_c,
        dewpoint_c
    )

    input_data = pd.DataFrame(
        [[
            temperature_c,
            dewpoint_c,
            pressure_hpa,
            wind_speed,
            humidity,
            precipitation_mm,
            latitude,
            longitude
        ]],
        columns=features
    )

    prediction = model.predict(input_data)[0]

    probability = model.predict_proba(
        input_data
    )[0][1]

    rain_probability = round(
        probability * 100,
        2
    )

    if city and country:
        location = f"{city}, {country}"
    elif city:
        location = city
    else:
        location = "this location"

    if prediction == 1:

        message = (
            f"Rain is likely tomorrow in {location} "
            f"with a {rain_probability}% chance of rain. "
            f"The humidity is {humidity:.2f}%."
        )

    else:

        message = (
            f"Rain is unlikely tomorrow in {location}. "
            f"The chance of rain is {rain_probability}%. "
            f"The humidity is {humidity:.2f}%."
        )

    return message


if __name__ == "__main__":

    result = predict_rain(
        temperature_c=30,
        dewpoint_c=25,
        pressure_hpa=1005,
        wind_speed=4,
        precipitation_mm=2,
        latitude=23.0225,
        longitude=72.5714,
        city="Ahmedabad",
        country="India"
    )

    print("\nWeatherGPT ML Prediction")
    print("------------------------")
    print(result)