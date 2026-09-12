import pandas as pd
import numpy as np

INPUT_FILE = "dataset/weather.csv"
OUTPUT_FILE = "dataset/processed_weather.csv"


def calculate_humidity(temperature, dewpoint):
    temperature_c = temperature - 273.15
    dewpoint_c = dewpoint - 273.15

    humidity = 100 * (
        np.exp((17.625 * dewpoint_c) / (243.04 + dewpoint_c))
        /
        np.exp((17.625 * temperature_c) / (243.04 + temperature_c))
    )

    return humidity.clip(0, 100)


def preprocess_data():

    print("Loading dataset...")

    df = pd.read_csv(INPUT_FILE)

    print("Original shape:", df.shape)

    df["valid_time"] = pd.to_datetime(df["valid_time"])

    df = df.sort_values(
        ["latitude", "longitude", "valid_time"]
    )

    # Convert temperature from Kelvin to Celsius
    df["temperature_c"] = df["t2m"] - 273.15
    df["dewpoint_c"] = df["d2m"] - 273.15

    # Convert pressure from Pascal to hPa
    df["pressure_hpa"] = df["msl"] / 100

    # Calculate wind speed
    df["wind_speed"] = np.sqrt(
        df["u10"] ** 2 + df["v10"] ** 2
    )

    # Convert precipitation from metres to millimetres
    df["precipitation_mm"] = df["tp"] * 1000

    # Calculate relative humidity
    df["humidity"] = calculate_humidity(
        df["t2m"],
        df["d2m"]
    )

    # Create date column
    df["date"] = df["valid_time"].dt.date

    print("Creating daily weather data...")

    daily = df.groupby(
        ["latitude", "longitude", "date"],
        as_index=False
    ).agg({
        "temperature_c": "mean",
        "dewpoint_c": "mean",
        "pressure_hpa": "mean",
        "wind_speed": "mean",
        "humidity": "mean",
        "precipitation_mm": "sum"
    })

    daily["date"] = pd.to_datetime(daily["date"])

    daily = daily.sort_values(
        ["latitude", "longitude", "date"]
    )

    # Tomorrow's rainfall
    daily["tomorrow_precipitation"] = (
        daily.groupby(
            ["latitude", "longitude"]
        )["precipitation_mm"]
        .shift(-1)
    )

    # 1 mm or more = rain
    daily["rain_tomorrow"] = (
        daily["tomorrow_precipitation"] >= 1.0
    ).astype(int)

    # Remove last day because tomorrow's value is unavailable
    daily = daily.dropna(
        subset=["tomorrow_precipitation"]
    )

    # Select final ML columns
    final_data = daily[
        [
            "date",
            "latitude",
            "longitude",
            "temperature_c",
            "dewpoint_c",
            "pressure_hpa",
            "wind_speed",
            "humidity",
            "precipitation_mm",
            "rain_tomorrow"
        ]
    ]

    final_data.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("\nPreprocessing completed!")
    print("Processed shape:", final_data.shape)

    print("\nFinal columns:")
    print(final_data.columns.tolist())

    print("\nRain distribution:")
    print(final_data["rain_tomorrow"].value_counts())

    print("\nFirst 5 rows:")
    print(final_data.head())

    print(
        "\nSaved to:",
        OUTPUT_FILE
    )


if __name__ == "__main__":
    preprocess_data()