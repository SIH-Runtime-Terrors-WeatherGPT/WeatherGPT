import joblib
import pandas as pd

from response_generator import generate_response

model=joblib.load("models/weather_model.pkl")
feature_columns=joblib.load("models/feature_columns.pkl")

def predict_weather(
    city,
    temperature_c,
    dewpoint_c,
    pressure_hpa,
    wind_speed,
    humidity,
    precipitation_mm,
    month,
    day_of_year
):

    sample=pd.DataFrame([{

        "temperature_c":temperature_c,

        "dewpoint_c":dewpoint_c,

        "pressure_hpa":pressure_hpa,

        "wind_speed":wind_speed,

        "humidity":humidity,

        "precipitation_mm":precipitation_mm,

        "month":month,

        "day_of_year":day_of_year

    }])

    sample=sample[feature_columns]

    prediction=model.predict(sample)[0]

    confidence=round(
        max(model.predict_proba(sample)[0])*100,
        2
    )

    response=generate_response(

        city,

        prediction,

        confidence,

        temperature_c,

        humidity,

        wind_speed
    )

    return{

        "city":city,

        "prediction":prediction,

        "confidence":confidence,

        "response":response
    }