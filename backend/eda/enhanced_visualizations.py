"""
Enhanced Visualizations for Auto EDA
Professional-grade charts and graphs using Plotly, Seaborn, and Matplotlib
"""

import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from scipy import stats
from typing import Optional
import warnings

warnings.filterwarnings("ignore")


class EnhancedVisualizer:
    """
    Professional visualization suite for EDA
    Generates interactive Plotly charts and statistical plots
    """

    def __init__(self, df: pd.DataFrame, target_col: Optional[str] = None):
        self.df = df
        self.target_col = target_col
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_cols = df.select_dtypes(
            include=["object", "category"]
        ).columns.tolist()
        self.datetime_cols = df.select_dtypes(include=["datetime64"]).columns.tolist()

        # Color schemes
        self.color_scheme = px.colors.qualitative.Set3
        self.sequential_colors = px.colors.sequential.Viridis

    # ==================== DATASET LEVEL VISUALIZATIONS ====================

    def create_data_type_summary(self) -> go.Figure:
        """Pie chart showing data type distribution"""
        type_counts = {
            "Numeric": len(self.numeric_cols),
            "Categorical": len(self.categorical_cols),
            "Datetime": len(self.datetime_cols),
            "Other": len(self.df.columns)
            - len(self.numeric_cols)
            - len(self.categorical_cols)
            - len(self.datetime_cols),
        }

        # Remove zero counts
        type_counts = {k: v for k, v in type_counts.items() if v > 0}

        # Better color scheme
        color_map = {
            "Numeric": "#4ECDC4",
            "Categorical": "#FFE66D",
            "Datetime": "#FF6B6B",
            "Other": "#95E1D3",
        }
        colors = [color_map.get(k, "#CCCCCC") for k in type_counts.keys()]

        fig = go.Figure(
            data=[
                go.Pie(
                    labels=list(type_counts.keys()),
                    values=list(type_counts.values()),
                    hole=0.4,
                    marker=dict(colors=colors, line=dict(color="#FFFFFF", width=2)),
                    textinfo="label+percent+value",
                    textfont=dict(size=14, color="#FFFFFF"),
                    hovertemplate="<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>",
                )
            ]
        )

        fig.update_layout(
            title={
                "text": "Data Type Distribution",
                "font": {"size": 18, "color": "#FFFFFF"},
            },
            height=450,
            showlegend=True,
            legend=dict(font=dict(size=12, color="#FFFFFF"), bgcolor="rgba(0,0,0,0)"),
            font=dict(color="#FFFFFF"),
            plot_bgcolor="#1E1E1E",
            paper_bgcolor="#1E1E1E",
        )

        return fig

    def create_missing_data_heatmap(self) -> go.Figure:
        """Interactive heatmap showing missing data patterns - CLEAR VERSION"""
        missing_matrix = self.df.isnull().astype(int)

        if missing_matrix.sum().sum() == 0:
            # No missing data
            fig = go.Figure()
            fig.add_annotation(
                text="✅ No Missing Data!",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                showarrow=False,
                font=dict(size=24, color="#4CAF50", family="Arial Black"),
            )
            fig.update_layout(
                height=400, plot_bgcolor="#1E1E1E", paper_bgcolor="#1E1E1E"
            )
            return fig

        # Filter to only show columns with missing data
        cols_with_missing = missing_matrix.columns[missing_matrix.sum() > 0].tolist()
        missing_matrix_filtered = missing_matrix[cols_with_missing]

        # Calculate missing percentage for each column
        missing_pct = (
            missing_matrix_filtered.sum() / len(missing_matrix_filtered) * 100
        ).sort_values(ascending=False)
        cols_sorted = missing_pct.index.tolist()

        # Sample rows intelligently - show pattern, not all rows
        sample_size = min(200, len(missing_matrix_filtered))  # Reduced for clarity
        if len(missing_matrix_filtered) > sample_size:
            # Sample evenly across the dataset
            step = len(missing_matrix_filtered) // sample_size
            sampled_indices = missing_matrix_filtered.index[::step][:sample_size]
            missing_matrix_sampled = missing_matrix_filtered.loc[
                sampled_indices, cols_sorted
            ]
        else:
            missing_matrix_sampled = missing_matrix_filtered[cols_sorted]

        # Create the heatmap with better visibility
        fig = go.Figure(
            data=go.Heatmap(
                z=missing_matrix_sampled.values.T,
                x=list(
                    range(len(missing_matrix_sampled))
                ),  # Use sequential numbers for clarity
                y=[
                    f"{col} ({missing_pct[col]:.1f}%)" for col in cols_sorted
                ],  # Add percentage to label
                colorscale=[
                    [0, "#1B5E20"],  # Darker green for present
                    [1, "#C62828"],  # Darker red for missing
                ],
                showscale=True,
                colorbar=dict(
                    title=dict(
                        text="<b>Data Status</b>",
                        font=dict(size=14, color="#FFFFFF", family="Arial"),
                    ),
                    tickvals=[0.25, 0.75],
                    ticktext=["<b>✓ Present</b>", "<b>✗ Missing</b>"],
                    tickfont=dict(size=12, color="#FFFFFF", family="Arial"),
                    len=0.4,
                    thickness=20,
                    x=1.02,
                    bgcolor="#2C2C2C",
                    bordercolor="#FFFFFF",
                    borderwidth=1,
                ),
                hovertemplate="<b>%{y}</b><br>Sample Point: %{x}<br>Status: %{z}<extra></extra>",
                xgap=2,  # Increased gap for clarity
                ygap=3,
            )
        )

        # Calculate appropriate height
        num_cols = len(cols_sorted)
        height = max(500, min(num_cols * 50, 900))  # Increased spacing

        # Calculate left margin
        max_col_length = (
            max([len(str(col)) for col in cols_sorted]) + 10
        )  # Add space for percentage
        left_margin = min(max(200, max_col_length * 8), 400)

        fig.update_layout(
            title={
                "text": f"<b>Missing Data Pattern</b><br><sub style='font-size:14px'>{len(cols_sorted)} column(s) with missing data | Showing {len(missing_matrix_sampled)} sample points</sub>",
                "font": {"size": 20, "color": "#FFFFFF", "family": "Arial"},
                "x": 0.5,
                "xanchor": "center",
                "y": 0.98,
                "yanchor": "top",
            },
            xaxis=dict(
                title=dict(
                    text="<b>Sample Points (evenly distributed across dataset)</b>",
                    font=dict(size=13, color="#FFFFFF", family="Arial"),
                ),
                tickfont=dict(size=10, color="#CCCCCC"),
                showgrid=True,
                gridcolor="#333333",
                gridwidth=1,
                zeroline=False,
                showticklabels=True,
                tickmode="linear",
                tick0=0,
                dtick=max(1, len(missing_matrix_sampled) // 10),  # Show ~10 ticks
            ),
            yaxis=dict(
                title=dict(
                    text="<b>Columns (with % missing)</b>",
                    font=dict(size=13, color="#FFFFFF", family="Arial"),
                ),
                tickfont=dict(size=12, color="#FFFFFF", family="Arial"),
                automargin=True,
                showgrid=True,
                gridcolor="#333333",
                gridwidth=1,
                zeroline=False,
                side="left",
            ),
            height=height,
            width=1200,  # Fixed width for consistency
            font=dict(size=12, color="#FFFFFF", family="Arial"),
            margin=dict(l=left_margin, r=100, t=120, b=80),
            plot_bgcolor="#1E1E1E",
            paper_bgcolor="#1E1E1E",
            hoverlabel=dict(
                bgcolor="#2C2C2C",
                font_size=13,
                font_family="Arial",
                font_color="#FFFFFF",
                bordercolor="#FFFFFF",
            ),
        )

        return fig

    def create_missing_data_bar(self) -> go.Figure:
        """Bar chart of missing data percentage per column"""
        missing_pct = (self.df.isnull().sum() / len(self.df) * 100).sort_values(
            ascending=False
        )
        missing_pct = missing_pct[missing_pct > 0]

        if len(missing_pct) == 0:
            fig = go.Figure()
            fig.add_annotation(
                text="✅ No Missing Data!",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                showarrow=False,
                font=dict(size=20, color="green"),
            )
            fig.update_layout(height=300)
            return fig

        # Color based on severity
        colors = []
        for val in missing_pct.values:
            if val < 5:
                colors.append("#90EE90")  # Light green - low
            elif val < 20:
                colors.append("#FFD700")  # Gold - moderate
            elif val < 50:
                colors.append("#FFA500")  # Orange - high
            else:
                colors.append("#FF4444")  # Red - critical

        fig = go.Figure(
            data=[
                go.Bar(
                    x=missing_pct.values,
                    y=missing_pct.index,
                    orientation="h",
                    marker=dict(color=colors, line=dict(color="#FFFFFF", width=1)),
                    text=[f"{v:.1f}%" for v in missing_pct.values],
                    textposition="outside",
                    textfont=dict(size=12, color="#FFFFFF"),
                    hovertemplate="<b>%{y}</b><br>Missing: %{x:.1f}%<extra></extra>",
                )
            ]
        )

        fig.update_layout(
            title={
                "text": "Missing Data by Column",
                "font": {"size": 18, "color": "#FFFFFF"},
            },
            xaxis_title="Missing Percentage (%)",
            yaxis_title="Columns",
            height=max(400, len(missing_pct) * 35),
            showlegend=False,
            font=dict(size=12, color="#FFFFFF"),
            yaxis=dict(tickfont=dict(size=11), automargin=True),
            xaxis=dict(tickfont=dict(size=11), gridcolor="#444444"),
            margin=dict(l=150, r=80, t=80, b=50),
            plot_bgcolor="#1E1E1E",
            paper_bgcolor="#1E1E1E",
        )

        return fig

    def create_correlation_heatmap(self, method="pearson") -> go.Figure:
        """Interactive correlation heatmap"""
        if len(self.numeric_cols) < 2:
            fig = go.Figure()
            fig.add_annotation(
                text="⚠️ Need at least 2 numeric columns",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                showarrow=False,
                font=dict(size=16, color="#FFFFFF"),
            )
            fig.update_layout(
                height=300, plot_bgcolor="#1E1E1E", paper_bgcolor="#1E1E1E"
            )
            return fig

        # Calculate correlation matrix with specified method
        corr_matrix = self.df[self.numeric_cols].corr(method=method)

        # Create unique colorscale based on method to force refresh
        colorscale = "RdBu_r" if method == "pearson" else "PuOr_r"

        fig = go.Figure(
            data=go.Heatmap(
                z=corr_matrix.values,
                x=corr_matrix.columns,
                y=corr_matrix.columns,
                colorscale=colorscale,
                zmid=0,
                zmin=-1,
                zmax=1,
                text=np.round(corr_matrix.values, 2),
                texttemplate="%{text}",
                textfont={"size": 10, "color": "#FFFFFF"},
                hovertemplate="<b>%{x}</b> vs <b>%{y}</b><br>"
                + f"{method.title()} Correlation: "
                + "%{z:.3f}<extra></extra>",
                colorbar=dict(
                    title=f"{method.title()}<br>Correlation",
                    titlefont=dict(color="#FFFFFF"),
                    tickfont=dict(color="#FFFFFF"),
                ),
                name=method,  # Add name to make it unique
            )
        )

        fig.update_layout(
            title={
                "text": f"{method.title()} Correlation Matrix",
                "font": {"size": 18, "color": "#FFFFFF"},
            },
            height=max(500, len(self.numeric_cols) * 40),
            xaxis={
                "side": "bottom",
                "tickfont": {"size": 10, "color": "#FFFFFF"},
                "tickangle": -45,
            },
            yaxis={"side": "left", "tickfont": {"size": 10, "color": "#FFFFFF"}},
            font=dict(color="#FFFFFF"),
            plot_bgcolor="#1E1E1E",
            paper_bgcolor="#1E1E1E",
        )

        return fig

    def create_correlation_with_target(self) -> Optional[go.Figure]:
        """Bar chart showing correlation of features with target"""
        if not self.target_col or self.target_col not in self.df.columns:
            return None

        if self.target_col not in self.numeric_cols:
            return None

        correlations = (
            self.df[self.numeric_cols]
            .corrwith(self.df[self.target_col])
            .drop(self.target_col, errors="ignore")
        )
        correlations = correlations.sort_values(ascending=False)

        fig = go.Figure(
            data=[
                go.Bar(
                    x=correlations.values,
                    y=correlations.index,
                    orientation="h",
                    marker=dict(
                        color=correlations.values,
                        colorscale="RdYlGn",
                        cmid=0,
                        showscale=True,
                    ),
                    text=[f"{v:.3f}" for v in correlations.values],
                    textposition="auto",
                )
            ]
        )

        fig.update_layout(
            title=f"Feature Correlation with Target: {self.target_col}",
            xaxis_title="Correlation Coefficient",
            yaxis_title="Features",
            height=max(400, len(correlations) * 25),
        )

        return fig

    # ==================== NUMERICAL VISUALIZATIONS ====================

    def create_distribution_plot(self, column: str) -> go.Figure:
        """Combined histogram and KDE for numerical column"""
        data = self.df[column].dropna()

        fig = make_subplots(
            rows=2,
            cols=1,
            subplot_titles=("Distribution", "Box Plot"),
            row_heights=[0.7, 0.3],
            vertical_spacing=0.15,
        )

        # Histogram with KDE
        fig.add_trace(
            go.Histogram(
                x=data,
                name="Histogram",
                marker_color="lightblue",
                opacity=0.7,
                nbinsx=50,
            ),
            row=1,
            col=1,
        )

        # Box plot
        fig.add_trace(
            go.Box(x=data, name="Box Plot", marker_color="lightcoral", boxmean="sd"),
            row=2,
            col=1,
        )

        # Add statistics
        mean_val = data.mean()
        median_val = data.median()

        fig.add_vline(
            x=mean_val,
            line_dash="dash",
            line_color="red",
            annotation_text=f"Mean: {mean_val:.2f}",
            row=1,
            col=1,
        )
        fig.add_vline(
            x=median_val,
            line_dash="dash",
            line_color="green",
            annotation_text=f"Median: {median_val:.2f}",
            row=1,
            col=1,
        )

        fig.update_layout(
            title=f"Distribution Analysis: {column}", height=600, showlegend=False
        )

        fig.update_xaxes(title_text=column, row=2, col=1)
        fig.update_yaxes(title_text="Frequency", row=1, col=1)

        return fig

    def create_violin_plot(self, column: str) -> go.Figure:
        """Violin plot for numerical column"""
        data = self.df[column].dropna()

        fig = go.Figure(
            data=go.Violin(
                y=data,
                box_visible=True,
                meanline_visible=True,
                fillcolor="lightseagreen",
                opacity=0.6,
                x0=column,
            )
        )

        fig.update_layout(
            title=f"Violin Plot: {column}", yaxis_title=column, height=500
        )

        return fig

    def create_outlier_detection_plot(self, column: str) -> go.Figure:
        """Outlier detection visualization using IQR and Z-score"""
        data = self.df[column].dropna()

        # IQR method
        Q1 = data.quantile(0.25)
        Q3 = data.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR

        # Z-score method
        stats.zscore(data)
        pass # z_outliers unused

        # Create figure
        fig = go.Figure()

        # Normal points
        normal_mask = (data >= lower_bound) & (data <= upper_bound)
        fig.add_trace(
            go.Scatter(
                x=data[normal_mask].index,
                y=data[normal_mask],
                mode="markers",
                name="Normal",
                marker=dict(color="blue", size=5, opacity=0.6),
            )
        )

        # IQR outliers
        outlier_mask = (data < lower_bound) | (data > upper_bound)
        fig.add_trace(
            go.Scatter(
                x=data[outlier_mask].index,
                y=data[outlier_mask],
                mode="markers",
                name="IQR Outliers",
                marker=dict(color="red", size=8, symbol="x"),
            )
        )

        # Add threshold lines
        fig.add_hline(
            y=lower_bound,
            line_dash="dash",
            line_color="orange",
            annotation_text=f"Lower: {lower_bound:.2f}",
        )
        fig.add_hline(
            y=upper_bound,
            line_dash="dash",
            line_color="orange",
            annotation_text=f"Upper: {upper_bound:.2f}",
        )

        fig.update_layout(
            title=f"Outlier Detection: {column}",
            xaxis_title="Index",
            yaxis_title=column,
            height=500,
        )

        return fig

    # ==================== CATEGORICAL VISUALIZATIONS ====================

    def create_category_bar_chart(self, column: str, top_k: int = 15) -> go.Figure:
        """Bar chart for categorical column (top K values)"""
        value_counts = self.df[column].value_counts().head(top_k)

        fig = go.Figure(
            data=[
                go.Bar(
                    x=value_counts.index,
                    y=value_counts.values,
                    marker=dict(
                        color=value_counts.values, colorscale="Viridis", showscale=True
                    ),
                    text=value_counts.values,
                    textposition="auto",
                )
            ]
        )

        fig.update_layout(
            title=f"Top {top_k} Categories: {column}",
            xaxis_title=column,
            yaxis_title="Count",
            height=500,
            xaxis_tickangle=-45,
        )

        return fig

    def create_category_pie_chart(self, column: str, top_k: int = 10) -> go.Figure:
        """Pie chart for categorical column"""
        value_counts = self.df[column].value_counts().head(top_k)

        # Add "Others" if there are more categories
        if len(self.df[column].value_counts()) > top_k:
            others_count = self.df[column].value_counts()[top_k:].sum()
            value_counts["Others"] = others_count

        fig = go.Figure(
            data=[
                go.Pie(
                    labels=value_counts.index,
                    values=value_counts.values,
                    hole=0.3,
                    marker=dict(colors=self.color_scheme),
                )
            ]
        )

        fig.update_layout(title=f"Category Distribution: {column}", height=500)

        return fig

    def create_category_target_relationship(self, column: str) -> Optional[go.Figure]:
        """Show relationship between categorical column and target"""
        if not self.target_col or self.target_col not in self.df.columns:
            return None

        if self.target_col not in self.numeric_cols:
            return None

        # Calculate mean target value per category
        grouped = (
            self.df.groupby(column)[self.target_col]
            .agg(["mean", "count"])
            .sort_values("mean", ascending=False)
        )

        # Filter categories with at least 5 samples
        grouped = grouped[grouped["count"] >= 5].head(15)

        fig = go.Figure(
            data=[
                go.Bar(
                    x=grouped.index,
                    y=grouped["mean"],
                    marker=dict(
                        color=grouped["mean"], colorscale="RdYlGn", showscale=True
                    ),
                    text=[f"{v:.2f}" for v in grouped["mean"]],
                    textposition="auto",
                    hovertemplate="Category: %{x}<br>Mean Target: %{y:.3f}<br>Count: %{customdata}<extra></extra>",
                    customdata=grouped["count"],
                )
            ]
        )

        fig.update_layout(
            title=f"{column} vs {self.target_col} (Mean)",
            xaxis_title=column,
            yaxis_title=f"Mean {self.target_col}",
            height=500,
            xaxis_tickangle=-45,
        )

        return fig

    # ==================== MULTIVARIATE VISUALIZATIONS ====================

    def create_scatter_matrix(self, max_cols: int = 6) -> go.Figure:
        """Scatter matrix for numerical columns (sampled)"""
        if len(self.numeric_cols) < 2:
            return None

        # Select top numeric columns
        cols_to_plot = self.numeric_cols[:max_cols]

        # Sample data if too large
        df_sample = self.df[cols_to_plot].copy()
        sample_size = len(df_sample)
        if len(df_sample) > 1000:
            df_sample = df_sample.sample(1000, random_state=42)
            sample_note = f" (showing {len(df_sample)} of {sample_size} samples)"
        else:
            sample_note = f" ({sample_size} samples)"

        fig = px.scatter_matrix(
            df_sample,
            dimensions=cols_to_plot,
            title=f"Scatter Matrix{sample_note}",
            height=max(600, len(cols_to_plot) * 120),
        )

        fig.update_traces(
            diagonal_visible=True, showupperhalf=False, marker=dict(size=3, opacity=0.5)
        )

        fig.update_layout(
            font=dict(color="#FFFFFF", size=10),
            plot_bgcolor="#1E1E1E",
            paper_bgcolor="#1E1E1E",
            title_font=dict(size=16, color="#FFFFFF"),
        )

        return fig

    def create_pairplot_plotly(self, max_cols: int = 5) -> go.Figure:
        """Interactive pairplot using Plotly"""
        if len(self.numeric_cols) < 2:
            return None

        cols_to_plot = self.numeric_cols[:max_cols]

        # Sample if needed
        df_sample = self.df[cols_to_plot]
        if len(df_sample) > 500:
            df_sample = df_sample.sample(500, random_state=42)

        fig = px.scatter_matrix(
            df_sample,
            dimensions=cols_to_plot,
            title=f"Pairplot: Top {len(cols_to_plot)} Numeric Features",
            height=700,
        )

        return fig
