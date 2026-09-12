from flask import Flask, request
from predict import predict_rain
from flask_cors import CORS

app = Flask(__name__)

CORS(app)


@app.route("/predict", methods=["POST"])
def predict():

    try:

        data = request.get_json()

        temperature_c = float(data["temperature_c"])
        dewpoint_c = float(data["dewpoint_c"])
        pressure_hpa = float(data["pressure_hpa"])
        wind_speed = float(data["wind_speed"])
        precipitation_mm = float(data["precipitation_mm"])
        latitude = float(data["latitude"])
        longitude = float(data["longitude"])

        city = data.get("city", "")
        country = data.get("country", "")

        result = predict_rain(
            temperature_c,
            dewpoint_c,
            pressure_hpa,
            wind_speed,
            precipitation_mm,
            latitude,
            longitude,
            city,
            country
        )

        return result

    except KeyError as e:

        return f"Missing field: {e.args[0]}", 400

    except Exception as e:

        return str(e), 500


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )