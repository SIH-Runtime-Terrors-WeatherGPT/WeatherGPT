import pandas as pd

def classify_weather(row):

    if row["precipitation_mm"] > 15 and row["wind_speed"] > 8:
        return "Stormy"

    elif row["precipitation_mm"] > 1:
        return "Rainy"

    elif row["humidity"] > 75:
        return "Cloudy"

    else:
        return "Sunny"

def preprocess_dataset():

    df = pd.read_csv("dataset/processed_weather.csv")

    df["date"] = pd.to_datetime(df["date"])

    # Feature Engineering
    df["month"] = df["date"].dt.month
    df["day_of_year"] = df["date"].dt.dayofyear

    # Remove constant columns
    df.drop(columns=["latitude","longitude"], errors="ignore", inplace=True)

    # Round numeric values
    for col in [
        "temperature_c",
        "dewpoint_c",
        "pressure_hpa",
        "wind_speed",
        "precipitation_mm"
    ]:
        df[col]=df[col].round(1)

    # New Target
    df["weather_condition"]=df.apply(classify_weather,axis=1)

    df.to_csv("dataset/processed_weather.csv",index=False)

    print("Preprocessing completed!")

if __name__=="__main__":
    preprocess_dataset()