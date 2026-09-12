from predict import predict_weather

# Test Case 1 - Rajkot
result = predict_weather(
    city="Rajkot",
    temperature_c=31,
    dewpoint_c=24,
    pressure_hpa=1008,
    wind_speed=4,
    humidity=82,
    precipitation_mm=5,
    month=9,
    day_of_year=255
)

print(result["response"])
print("-" * 50)

# Test Case 2 - London
result = predict_weather(
    city="London",
    temperature_c=16,
    dewpoint_c=12,
    pressure_hpa=1007,
    wind_speed=6,
    humidity=85,
    precipitation_mm=4,
    month=10,
    day_of_year=287
)

print(result["response"])
print("-" * 50)

# Test Case 3 - Mumbai
result = predict_weather(
    city="Mumbai",
    temperature_c=29,
    dewpoint_c=26,
    pressure_hpa=1006,
    wind_speed=9,
    humidity=90,
    precipitation_mm=18,
    month=7,
    day_of_year=190
)

print(result["response"])
print("-" * 50)

# Test Case 4 - Tokyo
result = predict_weather(
    city="Tokyo",
    temperature_c=21,
    dewpoint_c=17,
    pressure_hpa=1015,
    wind_speed=2,
    humidity=58,
    precipitation_mm=0,
    month=4,
    day_of_year=110
)

print(result["response"])