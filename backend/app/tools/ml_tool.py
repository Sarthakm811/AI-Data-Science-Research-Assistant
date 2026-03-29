"""AutoML Tool - Automated ML model building"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.metrics import accuracy_score, mean_squared_error, r2_score
from typing import Dict, Any
from pathlib import Path


class MLTool:
    def __init__(self, output_dir: str = "/outputs"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def auto_train_models(
        self, df: pd.DataFrame, target_col: str, task_type: str = "auto"
    ) -> Dict[str, Any]:
        """Train multiple models and compare"""
        # Detect task type
        if task_type == "auto":
            task_type = (
                "classification" if df[target_col].nunique() < 20 else "regression"
            )

        # Prepare data
        X = df.drop(columns=[target_col])
        y = df[target_col]

        # Handle categorical features
        X = pd.get_dummies(X, drop_first=True)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # Train models
        results = {}
        if task_type == "classification":
            models = {
                "Logistic Regression": LogisticRegression(max_iter=1000),
                "Random Forest": RandomForestClassifier(
                    n_estimators=100, random_state=42
                ),
            }
            for name, model in models.items():
                model.fit(X_train_scaled, y_train)
                y_pred = model.predict(X_test_scaled)
                results[name] = {
                    "accuracy": float(accuracy_score(y_test, y_pred)),
                    "cv_score": float(
                        cross_val_score(model, X_train_scaled, y_train, cv=5).mean()
                    ),
                }
        else:
            models = {
                "Linear Regression": LinearRegression(),
                "Random Forest": RandomForestRegressor(
                    n_estimators=100, random_state=42
                ),
            }
            for name, model in models.items():
                model.fit(X_train_scaled, y_train)
                y_pred = model.predict(X_test_scaled)
                results[name] = {
                    "r2_score": float(r2_score(y_test, y_pred)),
                    "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
                }

        # Find best model
        best_model = max(results.items(), key=lambda x: list(x[1].values())[0])

        return {
            "task_type": task_type,
            "models": results,
            "best_model": best_model[0],
            "best_score": best_model[1],
        }
