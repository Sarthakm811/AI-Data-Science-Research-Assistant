"""
Data Preprocessing Pipeline
Handles missing values, outliers, encoding, scaling, and feature selection
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, RobustScaler, MaxAbsScaler,
    LabelEncoder, OneHotEncoder, QuantileTransformer
)
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.impute import IterativeImputer
from sklearn.feature_selection import (
    VarianceThreshold, SelectKBest, mutual_info_classif, mutual_info_regression, RFE
)
from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from scipy import stats
import warnings

warnings.filterwarnings('ignore')


class DataPreprocessor:
    """Comprehensive data preprocessing pipeline"""
    
    def __init__(self):
        self.transformations = []
        self.scalers = {}
        self.encoders = {}
        self.imputers = {}
        self.feature_selector = None
        self.global_scaler = None
        self.scale_columns = []
        self.original_columns = []
        self.numeric_columns = []
        self.categorical_columns = []
        
    def fit_transform(
        self,
        df: pd.DataFrame,
        target_column: Optional[str] = None,
        handle_missing: str = "auto",
        handle_outliers: str = "none",
        encode_categorical: str = "auto",
        scale_features: str = "standard",
        feature_selection: str = "none",
        feature_selection_k: int = 10
    ) -> Dict[str, Any]:
        """
        Fit and transform the data
        
        Parameters:
        -----------
        df : DataFrame - Input data
        target_column : str - Target column name (optional)
        handle_missing : str - Missing value strategy
        handle_outliers : str - Outlier handling strategy
        encode_categorical : str - Categorical encoding strategy
        scale_features : str - Feature scaling strategy
        feature_selection : str - Feature selection strategy
        """
        
        self.original_columns = df.columns.tolist()
        result_df = df.copy()
        transformations = []
        
        # Identify column types
        self.numeric_columns = result_df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_columns = result_df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        if target_column:
            if target_column in self.numeric_columns:
                self.numeric_columns.remove(target_column)
            if target_column in self.categorical_columns:
                self.categorical_columns.remove(target_column)
        
        # 1. Handle Missing Values
        if handle_missing != "none":
            result_df, missing_info = self._handle_missing(result_df, handle_missing)
            transformations.append({"step": "missing_values", "method": handle_missing, "details": missing_info})
        
        # 2. Handle Outliers
        if handle_outliers != "none":
            result_df, outlier_info = self._handle_outliers(result_df, handle_outliers)
            transformations.append({"step": "outliers", "method": handle_outliers, "details": outlier_info})
        
        # 3. Encode Categorical Variables
        encoded_columns = {}
        if encode_categorical != "none" and self.categorical_columns:
            result_df, encoded_columns = self._encode_categorical(result_df, encode_categorical, target_column)
            transformations.append({"step": "encoding", "method": encode_categorical, "columns": list(encoded_columns.keys())})
        
        # 4. Scale Features
        scaling_params = {}
        if scale_features != "none":
            result_df, scaling_params = self._scale_features(result_df, scale_features, target_column)
            transformations.append({"step": "scaling", "method": scale_features})
        
        # 5. Feature Selection
        removed_columns = []
        if feature_selection != "none" and target_column:
            result_df, removed_columns = self._select_features(
                result_df, target_column, feature_selection, feature_selection_k
            )
            transformations.append({"step": "feature_selection", "method": feature_selection, "removed": removed_columns})
        
        self.transformations = transformations
        
        return {
            "data": result_df,
            "transformations": transformations,
            "removed_columns": removed_columns,
            "encoded_columns": encoded_columns,
            "scaling_params": scaling_params,
            "original_shape": df.shape,
            "new_shape": result_df.shape
        }
    
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform new data using fitted preprocessor"""
        result_df = df.copy()
        
        # Apply imputers
        for col, imputer in self.imputers.items():
            if col in result_df.columns:
                result_df[col] = imputer.transform(result_df[[col]])
        
        # Apply encoders
        for col, encoder in self.encoders.items():
            if col in result_df.columns:
                if isinstance(encoder, LabelEncoder):
                    result_df[col] = encoder.transform(result_df[col].astype(str))
                elif isinstance(encoder, OneHotEncoder):
                    encoded = encoder.transform(result_df[[col]])
                    encoded_df = pd.DataFrame(
                        encoded.toarray() if hasattr(encoded, 'toarray') else encoded,
                        columns=encoder.get_feature_names_out([col])
                    )
                    result_df = pd.concat([result_df.drop(columns=[col]), encoded_df], axis=1)
                elif isinstance(encoder, dict):
                    # frequency/target encoding map
                    result_df[col] = result_df[col].map(encoder).fillna(0)
        
        # Apply fitted global scaler in one pass to preserve feature ordering
        if self.global_scaler is not None and self.scale_columns:
            cols = [c for c in self.scale_columns if c in result_df.columns]
            if cols:
                result_df[cols] = self.global_scaler.transform(result_df[cols])
        
        return result_df
    
    def _handle_missing(self, df: pd.DataFrame, method: str) -> Tuple[pd.DataFrame, Dict]:
        """Handle missing values"""
        result_df = df.copy()
        info = {"columns_affected": [], "values_imputed": 0}
        
        missing_cols = result_df.columns[result_df.isnull().any()].tolist()
        info["columns_affected"] = missing_cols
        info["values_imputed"] = int(result_df.isnull().sum().sum())
        
        if method == "drop":
            result_df = result_df.dropna()
            
        elif method == "auto":
            # Numeric: median, Categorical: mode
            for col in self.numeric_columns:
                if result_df[col].isnull().any():
                    imputer = SimpleImputer(strategy='median')
                    result_df[col] = imputer.fit_transform(result_df[[col]])
                    self.imputers[col] = imputer
            
            for col in self.categorical_columns:
                if result_df[col].isnull().any():
                    imputer = SimpleImputer(strategy='most_frequent')
                    result_df[col] = imputer.fit_transform(result_df[[col]]).ravel()
                    self.imputers[col] = imputer
                    
        elif method in ["mean", "median", "most_frequent"]:
            strategy = method if method != "mode" else "most_frequent"
            for col in self.numeric_columns:
                if result_df[col].isnull().any():
                    imputer = SimpleImputer(strategy=strategy)
                    result_df[col] = imputer.fit_transform(result_df[[col]])
                    self.imputers[col] = imputer
                    
        elif method == "knn":
            numeric_df = result_df[self.numeric_columns]
            if numeric_df.isnull().any().any():
                imputer = KNNImputer(n_neighbors=5)
                result_df[self.numeric_columns] = imputer.fit_transform(numeric_df)
                self.imputers['_knn_'] = imputer
                
        elif method == "iterative":
            numeric_df = result_df[self.numeric_columns]
            if numeric_df.isnull().any().any():
                imputer = IterativeImputer(random_state=42, max_iter=10)
                result_df[self.numeric_columns] = imputer.fit_transform(numeric_df)
                self.imputers['_iterative_'] = imputer
        
        return result_df, info
    
    def _handle_outliers(self, df: pd.DataFrame, method: str) -> Tuple[pd.DataFrame, Dict]:
        """Handle outliers in numeric columns"""
        result_df = df.copy()
        info = {"columns_affected": [], "outliers_found": 0}
        
        for col in self.numeric_columns:
            Q1 = result_df[col].quantile(0.25)
            Q3 = result_df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR
            upper = Q3 + 1.5 * IQR
            
            outliers = ((result_df[col] < lower) | (result_df[col] > upper)).sum()
            
            if outliers > 0:
                info["columns_affected"].append(col)
                info["outliers_found"] += int(outliers)
                
                if method == "clip":
                    result_df[col] = result_df[col].clip(lower, upper)
                    
                elif method == "remove":
                    result_df = result_df[(result_df[col] >= lower) & (result_df[col] <= upper)]
                    
                elif method == "winsorize":
                    result_df[col] = stats.mstats.winsorize(result_df[col], limits=[0.05, 0.05])
                    
        if method == "isolation_forest":
            iso_forest = IsolationForest(contamination=0.1, random_state=42)
            numeric_data = result_df[self.numeric_columns].fillna(0)
            outlier_mask = iso_forest.fit_predict(numeric_data) == 1
            info["outliers_found"] = int((~outlier_mask).sum())
            result_df = result_df[outlier_mask]
        
        return result_df, info
    
    def _encode_categorical(
        self, 
        df: pd.DataFrame, 
        method: str,
        target_column: Optional[str] = None
    ) -> Tuple[pd.DataFrame, Dict]:
        """Encode categorical variables"""
        result_df = df.copy()
        encoded_info = {}
        
        for col in self.categorical_columns:
            unique_count = result_df[col].nunique()
            encoded_info[col] = {"original_unique": unique_count}
            
            if method == "auto":
                # Use label encoding for high cardinality, one-hot for low
                if unique_count > 10:
                    actual_method = "label"
                else:
                    actual_method = "onehot"
            else:
                actual_method = method
            
            if actual_method == "label":
                encoder = LabelEncoder()
                result_df[col] = encoder.fit_transform(result_df[col].astype(str))
                self.encoders[col] = encoder
                encoded_info[col]["method"] = "label"
                
            elif actual_method == "onehot":
                encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
                encoded = encoder.fit_transform(result_df[[col]])
                encoded_df = pd.DataFrame(
                    encoded,
                    columns=encoder.get_feature_names_out([col]),
                    index=result_df.index
                )
                result_df = pd.concat([result_df.drop(columns=[col]), encoded_df], axis=1)
                self.encoders[col] = encoder
                encoded_info[col]["method"] = "onehot"
                encoded_info[col]["new_columns"] = encoder.get_feature_names_out([col]).tolist()
                
            elif actual_method == "frequency":
                freq_map = result_df[col].value_counts(normalize=True).to_dict()
                result_df[col] = result_df[col].map(freq_map)
                self.encoders[col] = freq_map
                encoded_info[col]["method"] = "frequency"
                
            elif actual_method == "target" and target_column:
                target_mean = result_df.groupby(col)[target_column].mean().to_dict()
                result_df[col] = result_df[col].map(target_mean)
                self.encoders[col] = target_mean
                encoded_info[col]["method"] = "target"
        
        return result_df, encoded_info
    
    def _scale_features(
        self, 
        df: pd.DataFrame, 
        method: str,
        target_column: Optional[str] = None
    ) -> Tuple[pd.DataFrame, Dict]:
        """Scale numeric features"""
        result_df = df.copy()
        scaling_info = {}
        
        # Get columns to scale (exclude target)
        cols_to_scale = [c for c in self.numeric_columns if c in result_df.columns]
        if target_column and target_column in cols_to_scale:
            cols_to_scale.remove(target_column)
        
        if not cols_to_scale:
            return result_df, scaling_info
        
        if method == "standard":
            scaler = StandardScaler()
        elif method == "minmax":
            scaler = MinMaxScaler()
        elif method == "robust":
            scaler = RobustScaler()
        elif method == "maxabs":
            scaler = MaxAbsScaler()
        elif method == "quantile":
            scaler = QuantileTransformer(output_distribution='normal', random_state=42)
        else:
            return result_df, scaling_info
        
        result_df[cols_to_scale] = scaler.fit_transform(result_df[cols_to_scale])
        self.global_scaler = scaler
        self.scale_columns = cols_to_scale
        self.scalers = {col: scaler for col in cols_to_scale}
        
        scaling_info = {
            "method": method,
            "columns_scaled": cols_to_scale
        }
        
        if hasattr(scaler, 'mean_'):
            scaling_info["means"] = dict(zip(cols_to_scale, scaler.mean_.tolist()))
        if hasattr(scaler, 'scale_'):
            scaling_info["scales"] = dict(zip(cols_to_scale, scaler.scale_.tolist()))
        
        return result_df, scaling_info
    
    def _select_features(
        self,
        df: pd.DataFrame,
        target_column: str,
        method: str,
        k: int = 10
    ) -> Tuple[pd.DataFrame, List[str]]:
        """Select best features"""
        result_df = df.copy()
        removed_columns = []
        
        X = result_df.drop(columns=[target_column])
        y = result_df[target_column]
        
        # Only use numeric columns for feature selection
        numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
        X_numeric = X[numeric_cols].fillna(0)
        
        if len(numeric_cols) <= k:
            return result_df, removed_columns
        
        if method == "variance":
            selector = VarianceThreshold(threshold=0.01)
            selector.fit(X_numeric)
            selected_mask = selector.get_support()
            removed_columns = [c for c, s in zip(numeric_cols, selected_mask) if not s]
            
        elif method == "correlation":
            # Remove highly correlated features
            corr_matrix = X_numeric.corr().abs()
            upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
            removed_columns = [col for col in upper.columns if any(upper[col] > 0.95)]
            
        elif method == "mutual_info":
            is_classification = y.dtype == 'object' or len(y.unique()) < 20
            if is_classification:
                selector = SelectKBest(mutual_info_classif, k=min(k, len(numeric_cols)))
            else:
                selector = SelectKBest(mutual_info_regression, k=min(k, len(numeric_cols)))
            
            selector.fit(X_numeric, y)
            selected_mask = selector.get_support()
            removed_columns = [c for c, s in zip(numeric_cols, selected_mask) if not s]
            
        elif method == "rfe":
            is_classification = y.dtype == 'object' or len(y.unique()) < 20
            if is_classification:
                estimator = RandomForestClassifier(n_estimators=50, random_state=42)
            else:
                estimator = RandomForestRegressor(n_estimators=50, random_state=42)
            
            selector = RFE(estimator, n_features_to_select=min(k, len(numeric_cols)), step=1)
            selector.fit(X_numeric, y)
            selected_mask = selector.get_support()
            removed_columns = [c for c, s in zip(numeric_cols, selected_mask) if not s]
        
        # Remove selected columns
        result_df = result_df.drop(columns=removed_columns, errors='ignore')
        self.feature_selector = {"method": method, "removed": removed_columns}
        
        return result_df, removed_columns
    
    def get_summary(self) -> Dict[str, Any]:
        """Get preprocessing summary"""
        return {
            "transformations": self.transformations,
            "original_columns": self.original_columns,
            "numeric_columns": self.numeric_columns,
            "categorical_columns": self.categorical_columns,
            "scalers": list(self.scalers.keys()),
            "encoders": list(self.encoders.keys()),
            "imputers": list(self.imputers.keys())
        }
