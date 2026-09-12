import os
import json
import joblib
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    ConfusionMatrixDisplay,
    classification_report
)


def train():

    # Create output folder
    os.makedirs("outputs", exist_ok=True)
    os.makedirs("models", exist_ok=True)

    # Load processed dataset
    df = pd.read_csv("dataset/processed_weather.csv")

    # -----------------------------
    # Input Features (8 features)
    # -----------------------------
    X = df.drop(
        columns=["weather_condition", "date", "rain_tomorrow"],
        errors="ignore"
    )

    # Target
    y = df["weather_condition"]

    # Train-Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    # Random Forest Model
    model = RandomForestClassifier(
        n_estimators=200,
        random_state=42
    )

    # Train
    model.fit(X_train, y_train)

    # Predict
    pred = model.predict(X_test)

    # Accuracy
    accuracy = accuracy_score(y_test, pred)

    # Save Model
    joblib.dump(model, "models/weather_model.pkl")

    # Save Feature Order
    joblib.dump(list(X.columns), "models/feature_columns.pkl")

    # Save Metrics
    with open("outputs/metrics.json", "w") as f:
        json.dump({"accuracy": round(accuracy, 4)}, f, indent=4)

    # Save Classification Report
    with open("outputs/classification_report.txt", "w") as f:
        f.write(classification_report(y_test, pred))

    # Confusion Matrix
    cm = confusion_matrix(y_test, pred)
    ConfusionMatrixDisplay(cm).plot()
    plt.title("Confusion Matrix")
    plt.savefig("outputs/confusion_matrix.png")
    plt.close()

    # Feature Importance
    importance = pd.Series(
        model.feature_importances_,
        index=X.columns
    ).sort_values()

    importance.plot(kind="barh")
    plt.title("Feature Importance")
    plt.tight_layout()
    plt.savefig("outputs/feature_importance.png")
    plt.close()

    print("\nTraining completed successfully!")
    print(f"Accuracy: {accuracy:.4f}")
    print("\nFeatures used:")
    print(list(X.columns))


if __name__ == "__main__":
    train()