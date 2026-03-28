"""
GPU-Accelerated Machine Learning Engine
Supports 40+ models with hyperparameter tuning
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
from sklearn.model_selection import (
    train_test_split,
    cross_val_score,
    StratifiedKFold,
    KFold,
    GridSearchCV,
    RandomizedSearchCV,
    ParameterGrid,
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    r2_score, mean_squared_error, mean_absolute_error,
    confusion_matrix, classification_report, roc_auc_score, roc_curve,
    silhouette_score, calinski_harabasz_score, davies_bouldin_score,
)
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
import warnings
import time
import joblib

warnings.filterwarnings('ignore')

class MLEngine:
    def __init__(self):
        self.gpu_available = False
        self.gpu_name = "CPU Only"
        self._check_gpu()
        self.models = {}
        self.best_model = None

    def _get_hyperparameter_space(self, model_name: str, task_type: str) -> Dict[str, List[Any]]:
        name = model_name.lower()

        if 'random forest' in name:
            return {
                'n_estimators': [100, 200, 300],
                'max_depth': [None, 8, 16],
                'min_samples_split': [2, 5, 10],
            }
        if 'decision tree' in name:
            return {
                'max_depth': [None, 5, 10, 20],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4],
            }
        if 'logistic regression' in name:
            return {
                'C': [0.01, 0.1, 1.0, 10.0],
                'solver': ['lbfgs', 'liblinear'],
            }
        if 'linear regression' in name:
            return {}
        if 'xgboost' in name:
            return {
                'n_estimators': [100, 200, 300],
                'learning_rate': [0.01, 0.05, 0.1],
                'max_depth': [3, 6, 10],
            }
        if 'svm' in name or 'svr' in name:
            return {
                'C': [0.1, 1.0, 10.0],
                'gamma': ['scale', 'auto'],
                'kernel': ['rbf', 'linear'],
            }
        if 'knn' in name or 'neighbor' in name:
            return {
                'n_neighbors': [3, 5, 7, 11],
                'weights': ['uniform', 'distance'],
                'p': [1, 2],
            }

        return {}

    def _tune_model(
        self,
        model: Any,
        model_name: str,
        task_type: str,
        X_train: np.ndarray,
        y_train: np.ndarray,
        cv_folds: int,
        n_trials: int,
    ) -> Tuple[Any, Dict[str, Any]]:
        params = self._get_hyperparameter_space(model_name, task_type)
        if not params:
            return model, {'applied': False, 'strategy': None, 'reason': 'No tunable parameter space'}

        scoring = 'accuracy' if task_type == 'classification' else 'r2'
        grid_size = len(ParameterGrid(params))
        cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42) if task_type == 'classification' else KFold(n_splits=cv_folds, shuffle=True, random_state=42)

        if grid_size <= max(20, n_trials // 2):
            search = GridSearchCV(model, params, cv=cv, scoring=scoring, n_jobs=-1)
            strategy = 'grid_search'
        else:
            search = RandomizedSearchCV(
                model,
                params,
                n_iter=min(n_trials, grid_size),
                cv=cv,
                scoring=scoring,
                random_state=42,
                n_jobs=-1,
            )
            strategy = 'random_search'

        search.fit(X_train, y_train)
        return search.best_estimator_, {
            'applied': True,
            'strategy': strategy,
            'best_score': float(search.best_score_),
            'best_params': search.best_params_,
            'candidate_count': grid_size,
        }

    def cluster_data(
        self,
        X: np.ndarray,
        algorithm: str = 'kmeans',
        n_clusters: int = 3,
        eps: float = 0.5,
        min_samples: int = 5,
    ) -> Dict[str, Any]:
        algo = str(algorithm or 'kmeans').strip().lower()

        if algo == 'dbscan':
            model = DBSCAN(eps=eps, min_samples=min_samples)
            labels = model.fit_predict(X)
        elif algo == 'agglomerative':
            model = AgglomerativeClustering(n_clusters=max(2, n_clusters))
            labels = model.fit_predict(X)
        else:
            model = KMeans(n_clusters=max(2, n_clusters), random_state=42, n_init=10)
            labels = model.fit_predict(X)

        labels_arr = np.asarray(labels)
        unique_labels = sorted(np.unique(labels_arr).tolist())
        non_noise = labels_arr[labels_arr != -1] if algo == 'dbscan' else labels_arr
        valid_cluster_count = len(np.unique(non_noise))

        metrics = {
            'silhouette': None,
            'calinski_harabasz': None,
            'davies_bouldin': None,
            'inertia': None,
        }

        if hasattr(model, 'inertia_'):
            try:
                metrics['inertia'] = float(model.inertia_)
            except Exception:
                pass

        if valid_cluster_count >= 2:
            try:
                metrics['silhouette'] = float(silhouette_score(X, labels_arr))
            except Exception:
                pass
            try:
                metrics['calinski_harabasz'] = float(calinski_harabasz_score(X, labels_arr))
            except Exception:
                pass
            try:
                metrics['davies_bouldin'] = float(davies_bouldin_score(X, labels_arr))
            except Exception:
                pass

        cluster_counts = [
            {'cluster': int(lbl), 'count': int(np.sum(labels_arr == lbl))}
            for lbl in unique_labels
        ]

        return {
            'algorithm': algo,
            'labels': labels_arr.tolist(),
            'cluster_count': int(valid_cluster_count),
            'clusters': cluster_counts,
            'metrics': metrics,
            'model': model,
        }
        
    def _check_gpu(self):
        """Check for GPU availability"""
        # Check CUDA for PyTorch
        try:
            import torch
            if torch.cuda.is_available():
                self.gpu_available = True
                self.gpu_name = torch.cuda.get_device_name(0)
                print(f"✅ GPU Found: {self.gpu_name}")
                return
        except ImportError:
            pass
        
        # Check TensorFlow GPU
        try:
            import tensorflow as tf
            gpus = tf.config.list_physical_devices('GPU')
            if gpus:
                self.gpu_available = True
                self.gpu_name = gpus[0].name
                print(f"✅ TensorFlow GPU Found: {self.gpu_name}")
                return
        except ImportError:
            pass
        
        print("⚠️ No GPU detected, using CPU")
    
    def get_gpu_status(self) -> Dict[str, Any]:
        """Get detailed GPU status"""
        status = {
            "gpu_available": self.gpu_available,
            "gpu_name": self.gpu_name,
            "cuda_version": None,
            "memory_total": None,
            "memory_used": None
        }
        
        try:
            import torch
            if torch.cuda.is_available():
                status["cuda_version"] = torch.version.cuda
                status["memory_total"] = f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB"
                status["memory_used"] = f"{torch.cuda.memory_allocated(0) / 1e9:.2f} GB"
        except:
            pass
        
        return status
    
    def _get_classification_models(self, use_gpu: bool = True) -> Dict[str, Any]:
        """Get all classification models"""
        from sklearn.linear_model import (
            LogisticRegression, RidgeClassifier, SGDClassifier,
            PassiveAggressiveClassifier, Perceptron
        )
        from sklearn.ensemble import (
            RandomForestClassifier, ExtraTreesClassifier, 
            GradientBoostingClassifier, AdaBoostClassifier,
            BaggingClassifier, VotingClassifier, StackingClassifier,
            HistGradientBoostingClassifier
        )
        from sklearn.svm import SVC, NuSVC, LinearSVC
        from sklearn.neighbors import KNeighborsClassifier, RadiusNeighborsClassifier
        from sklearn.tree import DecisionTreeClassifier
        from sklearn.naive_bayes import GaussianNB, MultinomialNB, BernoulliNB, ComplementNB
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis, QuadraticDiscriminantAnalysis
        from sklearn.neural_network import MLPClassifier
        from sklearn.gaussian_process import GaussianProcessClassifier
        
        models = {
            # Boosting
            "Gradient Boosting": GradientBoostingClassifier(n_estimators=100, random_state=42),
            "Histogram Gradient Boosting": HistGradientBoostingClassifier(random_state=42),
            "AdaBoost": AdaBoostClassifier(n_estimators=100, random_state=42),
            
            # Ensemble
            "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            "Extra Trees": ExtraTreesClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            "Bagging Classifier": BaggingClassifier(n_estimators=50, random_state=42, n_jobs=-1),
            
            # Linear
            "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42, n_jobs=-1),
            "Ridge Classifier": RidgeClassifier(random_state=42),
            "SGD Classifier": SGDClassifier(max_iter=1000, random_state=42, n_jobs=-1),
            "Passive Aggressive": PassiveAggressiveClassifier(max_iter=1000, random_state=42, n_jobs=-1),
            "Perceptron": Perceptron(max_iter=1000, random_state=42, n_jobs=-1),
            
            # SVM
            "SVM (RBF)": SVC(kernel='rbf', probability=True, random_state=42),
            "SVM (Linear)": SVC(kernel='linear', probability=True, random_state=42),
            "SVM (Polynomial)": SVC(kernel='poly', probability=True, random_state=42),
            "NuSVC": NuSVC(probability=True, random_state=42),
            
            # Neural Network
            "Neural Network (MLP)": MLPClassifier(hidden_layer_sizes=(100, 50), max_iter=500, random_state=42),
            
            # Tree
            "Decision Tree": DecisionTreeClassifier(random_state=42),
            
            # Distance
            "K-Nearest Neighbors": KNeighborsClassifier(n_neighbors=5, n_jobs=-1),
            
            # Probabilistic
            "Gaussian Naive Bayes": GaussianNB(),
            "Bernoulli Naive Bayes": BernoulliNB(),
            
            # Discriminant
            "Linear Discriminant Analysis": LinearDiscriminantAnalysis(),
            "Quadratic Discriminant Analysis": QuadraticDiscriminantAnalysis(),
        }
        
        # Add GPU-accelerated models
        if use_gpu and self.gpu_available:
            try:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBClassifier(
                    n_estimators=100, tree_method='gpu_hist', 
                    gpu_id=0, random_state=42, use_label_encoder=False, eval_metric='logloss'
                )
            except:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBClassifier(n_estimators=100, random_state=42)
            
            try:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMClassifier(
                    n_estimators=100, device='gpu', random_state=42, verbose=-1
                )
            except:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMClassifier(n_estimators=100, random_state=42, verbose=-1)
            
            try:
                from catboost import CatBoostClassifier
                models["CatBoost"] = CatBoostClassifier(
                    iterations=100, task_type='GPU', devices='0', 
                    random_state=42, verbose=False
                )
            except:
                from catboost import CatBoostClassifier
                models["CatBoost"] = CatBoostClassifier(iterations=100, random_state=42, verbose=False)
        else:
            # CPU versions
            try:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBClassifier(n_estimators=100, random_state=42)
            except ImportError:
                pass
            
            try:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMClassifier(n_estimators=100, random_state=42, verbose=-1)
            except ImportError:
                pass
            
            try:
                from catboost import CatBoostClassifier
                models["CatBoost"] = CatBoostClassifier(iterations=100, random_state=42, verbose=False)
            except ImportError:
                pass
        
        return models
    
    def _get_regression_models(self, use_gpu: bool = True) -> Dict[str, Any]:
        """Get all regression models"""
        from sklearn.linear_model import (
            LinearRegression, Ridge, Lasso, ElasticNet, BayesianRidge,
            SGDRegressor, PassiveAggressiveRegressor, Lars, LassoLars,
            OrthogonalMatchingPursuit, HuberRegressor, RANSACRegressor, TheilSenRegressor
        )
        from sklearn.ensemble import (
            RandomForestRegressor, ExtraTreesRegressor,
            GradientBoostingRegressor, AdaBoostRegressor,
            BaggingRegressor, VotingRegressor, StackingRegressor,
            HistGradientBoostingRegressor
        )
        from sklearn.svm import SVR, NuSVR, LinearSVR
        from sklearn.neighbors import KNeighborsRegressor
        from sklearn.tree import DecisionTreeRegressor
        from sklearn.neural_network import MLPRegressor
        from sklearn.gaussian_process import GaussianProcessRegressor
        from sklearn.kernel_ridge import KernelRidge
        
        models = {
            # Boosting
            "Gradient Boosting": GradientBoostingRegressor(n_estimators=100, random_state=42),
            "Histogram Gradient Boosting": HistGradientBoostingRegressor(random_state=42),
            "AdaBoost": AdaBoostRegressor(n_estimators=100, random_state=42),
            
            # Ensemble
            "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            "Extra Trees": ExtraTreesRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            "Bagging Regressor": BaggingRegressor(n_estimators=50, random_state=42, n_jobs=-1),
            
            # Linear
            "Linear Regression": LinearRegression(n_jobs=-1),
            "Ridge Regression": Ridge(random_state=42),
            "Lasso Regression": Lasso(random_state=42),
            "ElasticNet": ElasticNet(random_state=42),
            "Bayesian Ridge": BayesianRidge(),
            "SGD Regressor": SGDRegressor(max_iter=1000, random_state=42),
            "Passive Aggressive Regressor": PassiveAggressiveRegressor(max_iter=1000, random_state=42),
            "LARS": Lars(random_state=42),
            "LARS Lasso": LassoLars(random_state=42),
            "Orthogonal Matching Pursuit": OrthogonalMatchingPursuit(),
            
            # Robust
            "Huber Regressor": HuberRegressor(max_iter=1000),
            "RANSAC Regressor": RANSACRegressor(random_state=42),
            "Theil-Sen Regressor": TheilSenRegressor(random_state=42, n_jobs=-1),
            
            # Kernel
            "Kernel Ridge": KernelRidge(kernel='rbf'),
            
            # SVM
            "SVR (RBF)": SVR(kernel='rbf'),
            "SVR (Linear)": SVR(kernel='linear'),
            "SVR (Polynomial)": SVR(kernel='poly'),
            "NuSVR": NuSVR(),
            
            # Neural Network
            "Neural Network (MLP)": MLPRegressor(hidden_layer_sizes=(100, 50), max_iter=500, random_state=42),
            
            # Tree
            "Decision Tree": DecisionTreeRegressor(random_state=42),
            
            # Distance
            "K-Nearest Neighbors": KNeighborsRegressor(n_neighbors=5, n_jobs=-1),
        }
        
        # Add GPU-accelerated models
        if use_gpu and self.gpu_available:
            try:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBRegressor(
                    n_estimators=100, tree_method='gpu_hist', gpu_id=0, random_state=42
                )
            except:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBRegressor(n_estimators=100, random_state=42)
            
            try:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMRegressor(
                    n_estimators=100, device='gpu', random_state=42, verbose=-1
                )
            except:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMRegressor(n_estimators=100, random_state=42, verbose=-1)
            
            try:
                from catboost import CatBoostRegressor
                models["CatBoost"] = CatBoostRegressor(
                    iterations=100, task_type='GPU', devices='0', random_state=42, verbose=False
                )
            except:
                from catboost import CatBoostRegressor
                models["CatBoost"] = CatBoostRegressor(iterations=100, random_state=42, verbose=False)
        else:
            try:
                import xgboost as xgb
                models["XGBoost"] = xgb.XGBRegressor(n_estimators=100, random_state=42)
            except ImportError:
                pass
            
            try:
                import lightgbm as lgb
                models["LightGBM"] = lgb.LGBMRegressor(n_estimators=100, random_state=42, verbose=-1)
            except ImportError:
                pass
            
            try:
                from catboost import CatBoostRegressor
                models["CatBoost"] = CatBoostRegressor(iterations=100, random_state=42, verbose=False)
            except ImportError:
                pass
        
        return models
    
    def _detect_task_type(self, y: pd.Series) -> str:
        """Auto-detect classification vs regression"""
        unique_ratio = len(y.unique()) / len(y)
        
        if y.dtype == 'object' or y.dtype.name == 'category':
            return 'classification'
        elif len(y.unique()) <= 20 and unique_ratio < 0.05:
            return 'classification'
        else:
            return 'regression'
    
    def _prepare_data(self, df: pd.DataFrame, target_column: str) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """Prepare data for training"""
        X = df.drop(columns=[target_column])
        y = df[target_column]
        
        # Handle categorical features
        for col in X.select_dtypes(include=['object', 'category']).columns:
            X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        
        # Handle target for classification
        if y.dtype == 'object' or y.dtype.name == 'category':
            y = LabelEncoder().fit_transform(y)
        
        # Handle missing values
        X = X.fillna(X.median(numeric_only=True))
        
        feature_names = X.columns.tolist()
        
        return X.values, np.array(y), feature_names
    
    def _apply_sampling(self, X: np.ndarray, y: np.ndarray, task_type: str, 
                        sample_size: int = 200) -> Tuple[np.ndarray, np.ndarray, bool]:
        """Apply intelligent sampling for large datasets to speed up training
        
        Args:
            X: Feature matrix
            y: Target array
            task_type: 'classification' or 'regression'
            sample_size: Threshold - sample if dataset exceeds this size (default 200)
        
        Returns:
            Tuple of (X_sampled, y_sampled, was_sampled)
        """
        if len(X) <= sample_size:
            return X, y, False
        
        # For classification, use stratified sampling to maintain class distribution
        if task_type == "classification":
            from sklearn.model_selection import train_test_split
            _, X_sampled, _, y_sampled = train_test_split(
                X, y, 
                train_size=sample_size,
                stratify=y,
                random_state=42
            )
            print(f"⚠️ SAMPLING: Dataset has {len(X)} rows. Using stratified sample of {sample_size} rows for faster training.")
            return X_sampled, y_sampled, True
        else:
            # For regression, use random sampling
            indices = np.random.RandomState(42).choice(len(X), size=sample_size, replace=False)
            X_sampled = X[indices]
            y_sampled = y[indices]
            print(f"⚠️ SAMPLING: Dataset has {len(X)} rows. Using random sample of {sample_size} rows for faster training.")
            return X_sampled, y_sampled, True
    
    def train_all_models(
        self,
        df: pd.DataFrame,
        target_column: str,
        task_type: str = "auto",
        use_gpu: bool = True,
        hyperparameter_tuning: bool = False,
        n_trials: int = 50,
        cv_folds: int = 5,
        test_size: float = 0.2,
        sample_threshold: int = 200
    ) -> Dict[str, Any]:
        """Train all models and return results
        
        Args:
            sample_threshold: Dataset size threshold for sampling (default 200 rows)
        """
        
        start_time = time.time()
        
        # Prepare data
        X, y, feature_names = self._prepare_data(df, target_column)
        
        # Detect task type
        if task_type == "auto":
            task_type = self._detect_task_type(pd.Series(y))
        
        # Apply sampling for large datasets
        X, y, was_sampled = self._apply_sampling(X, y, task_type, sample_size=sample_threshold)
        
        # Split data
        if task_type == "classification":
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42, stratify=y
            )
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42
            )
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        
        # Get models
        if task_type == "classification":
            models = self._get_classification_models(use_gpu)
        else:
            models = self._get_regression_models(use_gpu)
        
        results = []
        best_score = -np.inf
        best_model = None
        best_model_name = None
        
        for name, model in models.items():
            try:
                model_start = time.time()

                tuning_info = {
                    'applied': False,
                    'strategy': None,
                    'best_score': None,
                    'best_params': None,
                    'candidate_count': None,
                }

                if hyperparameter_tuning:
                    model, tuning_info = self._tune_model(
                        model=model,
                        model_name=name,
                        task_type=task_type,
                        X_train=X_train_scaled,
                        y_train=y_train,
                        cv_folds=max(2, cv_folds),
                        n_trials=max(5, n_trials),
                    )
                
                # Train
                model.fit(X_train_scaled, y_train)
                
                # Predict
                y_pred = model.predict(X_test_scaled)
                
                # Calculate metrics
                if task_type == "classification":
                    metrics = {
                        "accuracy": float(accuracy_score(y_test, y_pred)),
                        "precision": float(precision_score(y_test, y_pred, average='weighted', zero_division=0)),
                        "recall": float(recall_score(y_test, y_pred, average='weighted', zero_division=0)),
                        "f1": float(f1_score(y_test, y_pred, average='weighted', zero_division=0)),
                    }
                    
                    # ROC AUC for binary classification
                    if len(np.unique(y)) == 2 and hasattr(model, 'predict_proba'):
                        try:
                            y_proba = model.predict_proba(X_test_scaled)[:, 1]
                            metrics["roc_auc"] = float(roc_auc_score(y_test, y_proba))
                            fpr, tpr, _ = roc_curve(y_test, y_proba)
                            metrics["roc_curve"] = {
                                "fpr": fpr.tolist(),
                                "tpr": tpr.tolist(),
                            }
                        except:
                            pass
                    
                    score = metrics["accuracy"]
                else:
                    metrics = {
                        "r2": float(r2_score(y_test, y_pred)),
                        "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
                        "mae": float(mean_absolute_error(y_test, y_pred)),
                    }
                    score = metrics["r2"]
                
                # Cross-validation
                try:
                    if task_type == "classification":
                        cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
                        cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=cv, scoring='accuracy')
                    else:
                        cv = KFold(n_splits=cv_folds, shuffle=True, random_state=42)
                        cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=cv, scoring='r2')
                    
                    metrics["cv_mean"] = float(cv_scores.mean())
                    metrics["cv_std"] = float(cv_scores.std())
                except:
                    metrics["cv_mean"] = None
                    metrics["cv_std"] = None

                # Practical bias/variance indicators from held-out vs CV behavior.
                cv_mean = metrics.get("cv_mean")
                cv_std = metrics.get("cv_std")
                if cv_mean is not None:
                    bias_proxy = max(0.0, float(cv_mean) - float(score))
                    metrics["bias_proxy"] = float(bias_proxy)
                    metrics["bias_level"] = "High" if bias_proxy > 0.08 else "Moderate" if bias_proxy > 0.03 else "Low"
                else:
                    metrics["bias_proxy"] = None
                    metrics["bias_level"] = "Unknown"

                if cv_std is not None:
                    variance_proxy = max(0.0, float(cv_std))
                    metrics["variance_proxy"] = float(variance_proxy)
                    metrics["variance_level"] = "High" if variance_proxy > 0.08 else "Moderate" if variance_proxy > 0.03 else "Low"
                else:
                    metrics["variance_proxy"] = None
                    metrics["variance_level"] = "Unknown"
                
                # Feature importance
                feature_importance = self._get_feature_importance(model, feature_names)
                
                # Training time
                train_time = time.time() - model_start
                
                # Determine category
                category = self._get_model_category(name)
                
                result = {
                    "type": name,
                    "category": category,
                    **metrics,
                    "training_time": round(train_time, 3),
                    "feature_importance": feature_importance[:10] if feature_importance else [],
                    "tuning": tuning_info,
                }
                
                results.append(result)
                
                # Track best model
                if score > best_score:
                    best_score = score
                    best_model = model
                    best_model_name = name
                
                print(f"✅ {name}: {score:.4f} ({train_time:.2f}s)")
                
            except Exception as e:
                print(f"❌ {name}: {str(e)}")
                continue
        
        # Sort results
        if task_type == "classification":
            results.sort(key=lambda x: x.get("accuracy", 0), reverse=True)
        else:
            results.sort(key=lambda x: x.get("r2", 0), reverse=True)
        
        total_time = time.time() - start_time
        
        return {
            "task_type": task_type,
            "models": results,
            "best_model_name": best_model_name,
            "best_model": {"model": best_model, "scaler": scaler, "feature_names": feature_names},
            "training_time": round(total_time, 2),
            "gpu_used": use_gpu and self.gpu_available,
            "feature_names": feature_names,
            "data_shape": {"train": X_train.shape, "test": X_test.shape},
            "sampling_applied": was_sampled,
            "sample_threshold": sample_threshold
        }
    
    def _get_feature_importance(self, model, feature_names: List[str]) -> List[Dict[str, Any]]:
        """Extract feature importance from model"""
        importance = None
        
        if hasattr(model, 'feature_importances_'):
            importance = model.feature_importances_
        elif hasattr(model, 'coef_'):
            importance = np.abs(model.coef_).flatten()
            if len(importance) != len(feature_names):
                importance = np.abs(model.coef_).mean(axis=0) if model.coef_.ndim > 1 else importance
        
        if importance is not None and len(importance) == len(feature_names):
            # Normalize
            importance = importance / (importance.sum() + 1e-10)
            
            return sorted([
                {"feature": name, "importance": float(imp)}
                for name, imp in zip(feature_names, importance)
            ], key=lambda x: x["importance"], reverse=True)
        
        return []
    
    def _get_model_category(self, model_name: str) -> str:
        """Get category for a model"""
        categories = {
            "Boosting": ["XGBoost", "LightGBM", "CatBoost", "Gradient Boosting", "AdaBoost", "Histogram"],
            "Ensemble": ["Random Forest", "Extra Trees", "Bagging", "Voting", "Stacking"],
            "Linear": ["Linear", "Ridge", "Lasso", "Elastic", "Bayesian", "SGD", "Passive", "Perceptron", "LARS", "Orthogonal"],
            "SVM": ["SVM", "SVR", "NuSV"],
            "Neural Network": ["Neural Network", "MLP"],
            "Tree": ["Decision Tree"],
            "Distance": ["Neighbor", "KNN"],
            "Probabilistic": ["Naive Bayes", "Gaussian NB", "Bernoulli", "Multinomial", "Complement"],
            "Discriminant": ["Discriminant", "LDA", "QDA"],
            "Robust": ["Huber", "RANSAC", "Theil"],
            "Kernel": ["Kernel Ridge"],
            "Gaussian Process": ["Gaussian Process"]
        }
        
        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword.lower() in model_name.lower():
                    return category
        
        return "Other"
