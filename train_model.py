from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    OneHotEncoder,
    OrdinalEncoder,
    StandardScaler,
)
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split


PROJECT_DIR = Path(__file__).resolve().parent
DATASET_PATH = PROJECT_DIR / "Student Social Media And Mental Health Impact.csv"
MODEL_PATH = PROJECT_DIR / "Mental_Health_Model.pkl"
METRICS_PATH = PROJECT_DIR / "model_comparison.csv"
TARGET_COLUMN = "Mental_Health_Score"

FEATURE_COLUMNS = [
    "Age",
    "Gender",
    "Country",
    "Academic_Level",
    "Most_Used_Platform",
    "Purpose_Of_Use",
    "Avg_Daily_Usage_Hours",
    "Daily_Unlocks",
    "Study_Hours",
    "Physical_Activity_Hours",
    "Sleep_Hours_Per_Night",
    "Stress_Level",
]

STRESS_ORDER = ["Low", "Medium", "High", "Very High"]
SKEWED_NUMERIC = ["Study_Hours"]
OTHER_NUMERIC = [
    "Age",
    "Avg_Daily_Usage_Hours",
    "Daily_Unlocks",
    "Sleep_Hours_Per_Night",
]
PHYSICAL_ACTIVITY = ["Physical_Activity_Hours"]
NOMINAL_CATEGORICAL = [
    "Gender",
    "Country",
    "Academic_Level",
    "Most_Used_Platform",
    "Purpose_Of_Use",
]


def build_preprocessor():
    study_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("log_transform", FunctionTransformer(np.log1p)),
            ("scale", StandardScaler()),
        ]
    )
    numeric_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    activity_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("clip_negative", FunctionTransformer(np.clip, kw_args={"a_min": 0, "a_max": None})),
            ("scale", StandardScaler()),
        ]
    )
    stress_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "encode",
                OrdinalEncoder(
                    categories=[STRESS_ORDER],
                    handle_unknown="use_encoded_value",
                    unknown_value=-1,
                ),
            ),
        ]
    )
    nominal_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "encode",
                OneHotEncoder(
                    handle_unknown="infrequent_if_exist",
                    min_frequency=10,
                ),
            ),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("study", study_pipeline, SKEWED_NUMERIC),
            ("numeric", numeric_pipeline, OTHER_NUMERIC),
            ("physical_activity", activity_pipeline, PHYSICAL_ACTIVITY),
            ("stress", stress_pipeline, ["Stress_Level"]),
            ("categorical", nominal_pipeline, NOMINAL_CATEGORICAL),
        ]
    )


def train_and_evaluate():
    data = pd.read_csv(DATASET_PATH)
    missing_columns = set(FEATURE_COLUMNS + [TARGET_COLUMN]) - set(data.columns)
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing_columns)}")
    if TARGET_COLUMN in FEATURE_COLUMNS:
        raise ValueError("The target column must not be included in model features.")

    features = data[FEATURE_COLUMNS]
    target = data[TARGET_COLUMN]
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=0.30,
        random_state=42,
    )

    estimators = {
        "Linear Regression": LinearRegression(),
        "Decision Tree": DecisionTreeRegressor(random_state=42),
        "Random Forest": RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
    }

    results = []
    fitted_models = {}
    for name, estimator in estimators.items():
        pipeline = Pipeline(
            steps=[
                ("preprocessor", build_preprocessor()),
                ("regressor", estimator),
            ]
        )
        pipeline.fit(x_train, y_train)
        predictions = pipeline.predict(x_test)
        fitted_models[name] = pipeline
        results.append(
            {
                "Model": name,
                "MAE": mean_absolute_error(y_test, predictions),
                "RMSE": np.sqrt(mean_squared_error(y_test, predictions)),
                "R2": r2_score(y_test, predictions),
            }
        )

    comparison = pd.DataFrame(results).sort_values("RMSE").reset_index(drop=True)
    best_name = comparison.loc[0, "Model"]
    best_model = fitted_models[best_name]

    joblib.dump(best_model, MODEL_PATH)
    comparison.to_csv(METRICS_PATH, index=False)
    return comparison, best_name, best_model


if __name__ == "__main__":
    comparison, selected_model, _ = train_and_evaluate()
    print(comparison.to_string(index=False, float_format=lambda value: f"{value:.4f}"))
    print(f"\nSelected by lowest held-out RMSE: {selected_model}")
    print(f"Saved pipeline: {MODEL_PATH.name}")
    print(f"Saved comparison: {METRICS_PATH.name}")