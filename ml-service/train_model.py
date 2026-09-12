import pandas as pd
import joblib
import os

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.metrics import classification_report
from sklearn.metrics import confusion_matrix


INPUT_FILE = "dataset/processed_weather.csv"
MODEL_FILE = "models/rain_model.pkl"


def train_model():

    print("Loading processed dataset...")

    df = pd.read_csv(INPUT_FILE)

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values("date")

    print("Dataset shape:", df.shape)

    features = [
        "temperature_c",
        "dewpoint_c",
        "pressure_hpa",
        "wind_speed",
        "humidity",
        "precipitation_mm",
        "latitude",
        "longitude"
    ]

    target = "rain_tomorrow"

    X = df[features]
    y = df[target]

    print("\nFeatures:")
    print(features)

    print("\nTarget:")
    print(target)

    print("\nRain distribution:")
    print(y.value_counts())

    # 80% training data
    split_index = int(len(df) * 0.8)

    X_train = X.iloc[:split_index]
    X_test = X.iloc[split_index:]

    y_train = y.iloc[:split_index]
    y_test = y.iloc[split_index:]

    print("\nTraining data:", X_train.shape)
    print("Testing data:", X_test.shape)

    print("\nTraining Random Forest model...")

    model = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced"
    )

    model.fit(X_train, y_train)

    print("Training completed!")

    print("\nMaking predictions...")

    predictions = model.predict(X_test)

    accuracy = accuracy_score(
        y_test,
        predictions
    )

    print("\nModel Accuracy:")
    print(round(accuracy * 100, 2), "%")

    print("\nClassification Report:")
    print(
        classification_report(
            y_test,
            predictions,
            zero_division=0
        )
    )

    print("\nConfusion Matrix:")
    print(
        confusion_matrix(
            y_test,
            predictions
        )
    )

    os.makedirs("models", exist_ok=True)

    joblib.dump(
        model,
        MODEL_FILE
    )

    joblib.dump(
        features,
        "models/feature_columns.pkl"
    )

    print("\nModel saved successfully!")
    print("Model:", MODEL_FILE)


if __name__ == "__main__":
    train_model()