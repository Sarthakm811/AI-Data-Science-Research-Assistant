"""
Professional PDF Report Generator for EDA
Creates comprehensive, beautifully designed PDF reports with charts and statistics
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.backends.backend_pdf import PdfPages
from datetime import datetime
import io
import warnings

warnings.filterwarnings("ignore")

# Set professional style
plt.style.use("seaborn-v0_8-darkgrid")
sns.set_palette("husl")


class EDAPDFReport:
    """Generate comprehensive, professional EDA PDF reports"""

    def __init__(self, df: pd.DataFrame, dataset_name: str = "Dataset"):
        self.df = df
        self.dataset_name = dataset_name
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_cols = df.select_dtypes(
            include=["object", "category"]
        ).columns.tolist()

        # Professional color scheme
        self.primary_color = "#2C3E50"
        self.secondary_color = "#3498DB"
        self.accent_color = "#E74C3C"
        self.success_color = "#27AE60"
        self.warning_color = "#F39C12"
        self.bg_color = "#ECF0F1"

    def generate_report(self) -> bytes:
        """Generate complete PDF report"""
        buffer = io.BytesIO()

        with PdfPages(buffer) as pdf:
            # Page 1: Cover and Overview
            self._create_cover_page(pdf)

            # Page 2: Dataset Summary
            self._create_summary_page(pdf)

            # Page 3: Missing Data Analysis
            self._create_missing_data_page(pdf)

            # Page 4-5: Numerical Analysis
            if self.numeric_cols:
                self._create_numerical_analysis_pages(pdf)

            # Page 6: Correlation Analysis
            if len(self.numeric_cols) >= 2:
                self._create_correlation_page(pdf)

            # Page 7: Categorical Analysis
            if self.categorical_cols:
                self._create_categorical_analysis_page(pdf)

            # Page 8: Distribution Plots
            if self.numeric_cols:
                self._create_distribution_page(pdf)

            # Final Page: Recommendations
            self._create_recommendations_page(pdf)

        buffer.seek(0)
        return buffer.getvalue()

    def _create_cover_page(self, pdf):
        """Create clean, professional cover page"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")
        ax = fig.add_subplot(111)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")

        # Top colored bar
        ax.fill_between(
            [0, 1], [0.85, 0.85], [1, 1], color=self.primary_color, alpha=0.9, zorder=1
        )
        ax.fill_between(
            [0, 1],
            [0.82, 0.82],
            [0.85, 0.85],
            color=self.secondary_color,
            alpha=0.8,
            zorder=1,
        )

        # Icon and title on colored background
        ax.text(0.5, 0.93, "📊", ha="center", va="center", fontsize=50)
        ax.text(
            0.5,
            0.88,
            "EXPLORATORY DATA ANALYSIS",
            ha="center",
            va="center",
            fontsize=22,
            fontweight="bold",
            color="white",
        )

        # Subtitle
        ax.text(
            0.5,
            0.78,
            "Comprehensive Data Analysis Report",
            ha="center",
            va="center",
            fontsize=14,
            color=self.primary_color,
            style="italic",
        )

        # Dataset name box
        ax.fill_between(
            [0.15, 0.85],
            [0.68, 0.68],
            [0.73, 0.73],
            color="white",
            edgecolor=self.secondary_color,
            linewidth=2,
            zorder=2,
        )
        ax.plot(
            [0.15, 0.85, 0.85, 0.15, 0.15],
            [0.68, 0.68, 0.73, 0.73, 0.68],
            color=self.secondary_color,
            linewidth=2,
            zorder=3,
        )

        # Dataset name
        dataset_display = (
            self.dataset_name[:50] + "..."
            if len(self.dataset_name) > 50
            else self.dataset_name
        )
        ax.text(
            0.5,
            0.705,
            dataset_display,
            ha="center",
            va="center",
            fontsize=16,
            fontweight="bold",
            color=self.primary_color,
        )

        # Metrics cards
        metrics = [
            ("Rows", f"{self.df.shape[0]:,}", "📈"),
            ("Columns", f"{self.df.shape[1]}", "📊"),
            ("Numerical", f"{len(self.numeric_cols)}", "🔢"),
            ("Categorical", f"{len(self.categorical_cols)}", "📝"),
        ]

        card_positions = [0.15, 0.35, 0.55, 0.75]
        card_width = 0.15
        card_y = 0.45
        card_height = 0.15

        for i, (label, value, icon) in enumerate(metrics):
            x = card_positions[i]

            # Card background
            ax.fill_between(
                [x, x + card_width],
                [card_y, card_y],
                [card_y + card_height, card_y + card_height],
                color=self.bg_color,
                zorder=1,
            )
            ax.plot(
                [x, x + card_width, x + card_width, x, x],
                [card_y, card_y, card_y + card_height, card_y + card_height, card_y],
                color=self.secondary_color,
                linewidth=1.5,
                zorder=2,
            )

            # Icon
            ax.text(
                x + card_width / 2,
                card_y + card_height * 0.7,
                icon,
                ha="center",
                va="center",
                fontsize=20,
            )

            # Value
            ax.text(
                x + card_width / 2,
                card_y + card_height * 0.45,
                value,
                ha="center",
                va="center",
                fontsize=14,
                fontweight="bold",
                color=self.secondary_color,
            )

            # Label
            ax.text(
                x + card_width / 2,
                card_y + card_height * 0.2,
                label,
                ha="center",
                va="center",
                fontsize=9,
                color=self.primary_color,
            )

        # Date
        ax.text(
            0.5,
            0.25,
            f'Generated on {datetime.now().strftime("%B %d, %Y")}',
            ha="center",
            va="center",
            fontsize=11,
            color="gray",
        )
        ax.text(
            0.5,
            0.22,
            f'{datetime.now().strftime("%I:%M %p")}',
            ha="center",
            va="center",
            fontsize=10,
            color="gray",
            style="italic",
        )

        # Decorative line
        ax.plot(
            [0.25, 0.75],
            [0.15, 0.15],
            color=self.secondary_color,
            linewidth=2,
            alpha=0.5,
        )

        # Footer
        ax.text(
            0.5,
            0.08,
            "AI Data Science Research Assistant",
            ha="center",
            va="center",
            fontsize=11,
            color=self.primary_color,
            fontweight="bold",
        )
        ax.text(
            0.5,
            0.05,
            "Powered by Advanced Analytics",
            ha="center",
            va="center",
            fontsize=9,
            color="gray",
            style="italic",
        )

        plt.tight_layout()
        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()

    def _create_summary_page(self, pdf):
        """Create professional dataset summary page with visual elements"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        # Header with colored bar
        from matplotlib.patches import Rectangle

        header_rect = Rectangle(
            (0, 0.92),
            1,
            0.08,
            transform=fig.transFigure,
            facecolor=self.primary_color,
            zorder=0,
        )
        fig.patches.append(header_rect)

        fig.text(
            0.5,
            0.96,
            "DATASET SUMMARY",
            ha="center",
            va="center",
            fontsize=20,
            fontweight="bold",
            color="white",
        )

        # Create grid layout
        gs = fig.add_gridspec(
            4, 2, left=0.1, right=0.9, top=0.88, bottom=0.1, hspace=0.4, wspace=0.3
        )

        # Basic Information Card
        ax1 = fig.add_subplot(gs[0, :])
        ax1.axis("off")

        info_box = Rectangle(
            (0.05, 0.1),
            0.9,
            0.8,
            transform=ax1.transAxes,
            facecolor=self.bg_color,
            edgecolor=self.secondary_color,
            linewidth=2,
        )
        ax1.add_patch(info_box)

        info_text = f"""
    📊 BASIC INFORMATION
    
    Total Rows:                {self.df.shape[0]:,}
    Total Columns:             {self.df.shape[1]}
    Memory Usage:              {self.df.memory_usage(deep=True).sum() / 1024**2:.2f} MB
    Duplicate Rows:            {self.df.duplicated().sum():,}
    Complete Rows:             {self.df.dropna().shape[0]:,} ({self.df.dropna().shape[0]/len(self.df)*100:.1f}%)
        """
        ax1.text(
            0.1,
            0.5,
            info_text,
            fontsize=11,
            family="monospace",
            verticalalignment="center",
            transform=ax1.transAxes,
        )

        # Column Types Pie Chart
        ax2 = fig.add_subplot(gs[1, 0])
        type_counts = {
            "Numerical": len(self.numeric_cols),
            "Categorical": len(self.categorical_cols),
            "Other": self.df.shape[1]
            - len(self.numeric_cols)
            - len(self.categorical_cols),
        }
        type_counts = {k: v for k, v in type_counts.items() if v > 0}

        colors = [self.secondary_color, self.success_color, self.warning_color][
            : len(type_counts)
        ]
        wedges, texts, autotexts = ax2.pie(
            type_counts.values(),
            labels=type_counts.keys(),
            autopct="%1.1f%%",
            colors=colors,
            startangle=90,
            textprops={"fontsize": 10},
        )
        for autotext in autotexts:
            autotext.set_color("white")
            autotext.set_fontweight("bold")
        ax2.set_title(
            "Column Types Distribution",
            fontsize=12,
            fontweight="bold",
            color=self.primary_color,
            pad=10,
        )

        # Missing Data Summary
        ax3 = fig.add_subplot(gs[1, 1])
        ax3.axis("off")

        missing_box = Rectangle(
            (0.05, 0.1),
            0.9,
            0.8,
            transform=ax3.transAxes,
            facecolor="#FFF3CD",
            edgecolor=self.warning_color,
            linewidth=2,
        )
        ax3.add_patch(missing_box)

        total_missing = self.df.isnull().sum().sum()
        missing_pct = total_missing / (self.df.shape[0] * self.df.shape[1]) * 100
        cols_with_missing = (self.df.isnull().sum() > 0).sum()

        missing_text = f"""
    ⚠️  MISSING DATA
    
    Total Missing:     {total_missing:,}
    Percentage:        {missing_pct:.2f}%
    Affected Columns:  {cols_with_missing}
    
    Status: {'✓ Good' if missing_pct < 5 else '⚠ Needs Attention' if missing_pct < 20 else '❌ Critical'}
        """
        ax3.text(
            0.1,
            0.5,
            missing_text,
            fontsize=10,
            family="monospace",
            verticalalignment="center",
            transform=ax3.transAxes,
        )

        # Data Quality Score
        ax4 = fig.add_subplot(gs[2, :])
        ax4.axis("off")

        # Calculate quality score
        completeness = (1 - missing_pct / 100) * 100
        uniqueness = (1 - self.df.duplicated().sum() / len(self.df)) * 100
        quality_score = (completeness + uniqueness) / 2

        # Quality gauge
        from matplotlib.patches import Wedge

        center = (0.5, 0.5)
        radius = 0.35

        # Background arc
        theta1, theta2 = 180, 0
        arc_bg = Wedge(
            center,
            radius,
            theta1,
            theta2,
            width=0.1,
            facecolor="#E0E0E0",
            transform=ax4.transAxes,
        )
        ax4.add_patch(arc_bg)

        # Score arc
        score_angle = 180 - (quality_score / 100 * 180)
        color = (
            self.success_color
            if quality_score >= 80
            else self.warning_color if quality_score >= 60 else self.accent_color
        )
        arc_score = Wedge(
            center,
            radius,
            180,
            score_angle,
            width=0.1,
            facecolor=color,
            transform=ax4.transAxes,
        )
        ax4.add_patch(arc_score)

        # Score text
        ax4.text(
            0.5,
            0.45,
            f"{quality_score:.0f}",
            ha="center",
            va="center",
            fontsize=40,
            fontweight="bold",
            color=color,
            transform=ax4.transAxes,
        )
        ax4.text(
            0.5,
            0.35,
            "Data Quality Score",
            ha="center",
            va="center",
            fontsize=12,
            color=self.primary_color,
            transform=ax4.transAxes,
        )

        # Column List
        ax5 = fig.add_subplot(gs[3, :])
        ax5.axis("off")

        ax5.text(
            0.05,
            0.9,
            "📋 COLUMN OVERVIEW",
            fontsize=12,
            fontweight="bold",
            color=self.primary_color,
            transform=ax5.transAxes,
        )

        # Show first 15 columns
        col_info = []
        for col in self.df.columns[:15]:
            dtype = str(self.df[col].dtype)
            missing = self.df[col].isnull().sum()
            col_info.append(f"  • {col[:30]:<30} | {dtype:<10} | Missing: {missing}")

        if len(self.df.columns) > 15:
            col_info.append(f"  ... and {len(self.df.columns) - 15} more columns")

        col_text = "\n".join(col_info)
        ax5.text(
            0.05,
            0.75,
            col_text,
            fontsize=8,
            family="monospace",
            verticalalignment="top",
            transform=ax5.transAxes,
        )

        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()

    def _create_missing_data_page(self, pdf):
        """Create professional missing data visualization page"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        # Header
        from matplotlib.patches import Rectangle

        header_rect = Rectangle(
            (0, 0.92),
            1,
            0.08,
            transform=fig.transFigure,
            facecolor=self.warning_color,
            zorder=0,
        )
        fig.patches.append(header_rect)
        fig.text(
            0.5,
            0.96,
            "MISSING DATA ANALYSIS",
            ha="center",
            va="center",
            fontsize=20,
            fontweight="bold",
            color="white",
        )

        missing = self.df.isnull().sum()
        missing_pct = missing / len(self.df) * 100
        missing_data = pd.DataFrame(
            {"Missing": missing[missing > 0], "Percentage": missing_pct[missing > 0]}
        ).sort_values("Percentage", ascending=False)

        if len(missing_data) > 0:
            gs = fig.add_gridspec(
                2, 1, left=0.1, right=0.9, top=0.88, bottom=0.1, hspace=0.3
            )

            # Bar chart with gradient colors
            ax1 = fig.add_subplot(gs[0])
            colors = [
                (
                    self.accent_color
                    if x > 50
                    else self.warning_color if x > 20 else self.success_color
                )
                for x in missing_data["Percentage"]
            ]

            ax1.barh(
                range(len(missing_data)), missing_data["Percentage"], color=colors
            )
            ax1.set_yticks(range(len(missing_data)))
            ax1.set_yticklabels(missing_data.index, fontsize=9)
            ax1.set_xlabel("Missing Percentage (%)", fontsize=11, fontweight="bold")
            ax1.set_title(
                "Missing Data by Column",
                fontsize=13,
                fontweight="bold",
                color=self.primary_color,
                pad=15,
            )
            ax1.grid(axis="x", alpha=0.3, linestyle="--")
            ax1.spines["top"].set_visible(False)
            ax1.spines["right"].set_visible(False)

            # Add percentage labels
            for i, (idx, row) in enumerate(missing_data.iterrows()):
                ax1.text(
                    row["Percentage"] + 1,
                    i,
                    f"{row['Percentage']:.1f}%",
                    va="center",
                    fontsize=8,
                    fontweight="bold",
                )

            # Heatmap
            ax2 = fig.add_subplot(gs[1])
            sample_size = min(50, len(self.df))
            sns.heatmap(
                self.df.head(sample_size).isnull(),
                cbar=True,
                cmap="RdYlGn_r",
                ax=ax2,
                yticklabels=False,
                cbar_kws={"label": "Missing"},
            )
            ax2.set_title(
                f"Missing Data Pattern (First {sample_size} rows)",
                fontsize=13,
                fontweight="bold",
                color=self.primary_color,
                pad=15,
            )
            ax2.set_xlabel("Columns", fontsize=10)

        else:
            ax = fig.add_subplot(111)

            # Success message with icon
            success_box = Rectangle(
                (0.2, 0.4),
                0.6,
                0.2,
                transform=ax.transAxes,
                facecolor="#D4EDDA",
                edgecolor=self.success_color,
                linewidth=3,
            )
            ax.add_patch(success_box)

            ax.text(
                0.5,
                0.55,
                "✓",
                ha="center",
                va="center",
                fontsize=60,
                color=self.success_color,
                transform=ax.transAxes,
            )
            ax.text(
                0.5,
                0.45,
                "No Missing Data Found!",
                ha="center",
                va="center",
                fontsize=18,
                fontweight="bold",
                color=self.success_color,
                transform=ax.transAxes,
            )
            ax.axis("off")

        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()

    def _create_numerical_analysis_pages(self, pdf):
        """Create numerical features analysis"""
        # Summary statistics
        fig = plt.figure(figsize=(8.5, 11))
        fig.suptitle(
            "Numerical Features - Summary Statistics", fontsize=16, fontweight="bold"
        )

        ax = fig.add_subplot(111)
        ax.axis("off")

        stats_df = self.df[self.numeric_cols].describe().T
        stats_df = stats_df.round(2)

        # Create table
        table_data = []
        table_data.append(["Feature", "Mean", "Std", "Min", "25%", "50%", "75%", "Max"])
        for idx, row in stats_df.iterrows():
            table_data.append(
                [
                    idx[:20],
                    f"{row['mean']:.2f}",
                    f"{row['std']:.2f}",
                    f"{row['min']:.2f}",
                    f"{row['25%']:.2f}",
                    f"{row['50%']:.2f}",
                    f"{row['75%']:.2f}",
                    f"{row['max']:.2f}",
                ]
            )

        table = ax.table(
            cellText=table_data[:15], cellLoc="center", loc="center", bbox=[0, 0, 1, 1]
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1, 2)

        # Style header
        for i in range(len(table_data[0])):
            table[(0, i)].set_facecolor("#3498DB")
            table[(0, i)].set_text_props(weight="bold", color="white")

        pdf.savefig(fig, bbox_inches="tight")
        plt.close()

    def _create_correlation_page(self, pdf):
        """Create professional correlation heatmap"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        # Header
        from matplotlib.patches import Rectangle

        header_rect = Rectangle(
            (0, 0.92),
            1,
            0.08,
            transform=fig.transFigure,
            facecolor=self.secondary_color,
            zorder=0,
        )
        fig.patches.append(header_rect)
        fig.text(
            0.5,
            0.96,
            "CORRELATION ANALYSIS",
            ha="center",
            va="center",
            fontsize=20,
            fontweight="bold",
            color="white",
        )

        ax = fig.add_subplot(111)

        # Calculate correlation
        corr = self.df[self.numeric_cols].corr()

        # Create professional heatmap
        mask = np.triu(np.ones_like(corr, dtype=bool))

        # Use diverging colormap
        sns.heatmap(
            corr,
            mask=mask,
            annot=True,
            fmt=".2f",
            cmap="RdBu_r",
            center=0,
            square=True,
            linewidths=0.5,
            linecolor="white",
            ax=ax,
            cbar_kws={"shrink": 0.8, "label": "Correlation Coefficient"},
            annot_kws={"size": 8, "weight": "bold"},
        )

        ax.set_title(
            "Pearson Correlation Matrix\n(Lower Triangle)",
            fontsize=14,
            fontweight="bold",
            color=self.primary_color,
            pad=20,
        )

        # Rotate labels
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right", fontsize=9)
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=9)

        # Add interpretation guide
        guide_text = """
Interpretation Guide:
• 1.0 to 0.7: Strong positive correlation
• 0.7 to 0.3: Moderate positive correlation
• 0.3 to -0.3: Weak or no correlation
• -0.3 to -0.7: Moderate negative correlation
• -0.7 to -1.0: Strong negative correlation
        """
        fig.text(
            0.1,
            0.08,
            guide_text,
            fontsize=9,
            family="monospace",
            bbox=dict(boxstyle="round", facecolor=self.bg_color, alpha=0.8),
        )

        plt.tight_layout(rect=[0, 0.12, 1, 0.92])
        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()

    def _create_categorical_analysis_page(self, pdf):
        """Create categorical features analysis"""
        fig = plt.figure(figsize=(8.5, 11))
        fig.suptitle("Categorical Features Analysis", fontsize=16, fontweight="bold")

        n_cats = min(6, len(self.categorical_cols))

        for i, col in enumerate(self.categorical_cols[:n_cats]):
            ax = fig.add_subplot(3, 2, i + 1)

            value_counts = self.df[col].value_counts().head(10)
            value_counts.plot(kind="barh", ax=ax, color="skyblue")
            ax.set_title(f"{col} (Top 10)", fontsize=10)
            ax.set_xlabel("Count")

        plt.tight_layout()
        pdf.savefig(fig, bbox_inches="tight")
        plt.close()

    def _create_distribution_page(self, pdf):
        """Create professional distribution plots with KDE"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        # Header
        from matplotlib.patches import Rectangle

        header_rect = Rectangle(
            (0, 0.92),
            1,
            0.08,
            transform=fig.transFigure,
            facecolor=self.success_color,
            zorder=0,
        )
        fig.patches.append(header_rect)
        fig.text(
            0.5,
            0.96,
            "DISTRIBUTION ANALYSIS",
            ha="center",
            va="center",
            fontsize=20,
            fontweight="bold",
            color="white",
        )

        n_plots = min(6, len(self.numeric_cols))
        gs = fig.add_gridspec(
            3, 2, left=0.1, right=0.9, top=0.88, bottom=0.08, hspace=0.4, wspace=0.3
        )

        for i, col in enumerate(self.numeric_cols[:n_plots]):
            ax = fig.add_subplot(gs[i // 2, i % 2])

            # Histogram with KDE
            data = self.df[col].dropna()

            # Histogram
            n, bins, patches = ax.hist(
                data,
                bins=30,
                alpha=0.6,
                color=self.secondary_color,
                edgecolor="white",
                linewidth=0.5,
                density=True,
            )

            # KDE overlay
            try:
                from scipy import stats as sp_stats

                kde = sp_stats.gaussian_kde(data)
                x_range = np.linspace(data.min(), data.max(), 100)
                ax.plot(
                    x_range,
                    kde(x_range),
                    color=self.accent_color,
                    linewidth=2,
                    label="KDE",
                )
            except Exception:
                pass

            # Mean and median lines
            mean_val = data.mean()
            median_val = data.median()

            ax.axvline(
                mean_val,
                color="red",
                linestyle="--",
                linewidth=2,
                alpha=0.7,
                label=f"Mean: {mean_val:.2f}",
            )
            ax.axvline(
                median_val,
                color="green",
                linestyle="--",
                linewidth=2,
                alpha=0.7,
                label=f"Median: {median_val:.2f}",
            )

            ax.set_title(
                f"{col}",
                fontsize=11,
                fontweight="bold",
                color=self.primary_color,
                pad=10,
            )
            ax.set_ylabel("Density", fontsize=9)
            ax.set_xlabel("Value", fontsize=9)
            ax.legend(fontsize=7, loc="best")
            ax.grid(axis="y", alpha=0.3, linestyle="--")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()

    def _create_recommendations_page(self, pdf):
        """Create professional recommendations page with icons and priorities"""
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        # Header
        from matplotlib.patches import Rectangle

        header_rect = Rectangle(
            (0, 0.92),
            1,
            0.08,
            transform=fig.transFigure,
            facecolor=self.primary_color,
            zorder=0,
        )
        fig.patches.append(header_rect)
        fig.text(
            0.5,
            0.96,
            "RECOMMENDATIONS & NEXT STEPS",
            ha="center",
            va="center",
            fontsize=20,
            fontweight="bold",
            color="white",
        )

        ax = fig.add_subplot(111)
        ax.axis("off")

        recommendations = []

        # Missing data recommendations
        missing_pct = (
            self.df.isnull().sum().sum() / (self.df.shape[0] * self.df.shape[1]) * 100
        )
        if missing_pct > 20:
            recommendations.append(
                (
                    "🔴 CRITICAL",
                    f"Handle missing data ({missing_pct:.1f}% of dataset)",
                    "Use imputation or remove columns with >50% missing",
                )
            )
        elif missing_pct > 5:
            recommendations.append(
                (
                    "🟡 HIGH",
                    f"Address missing data ({missing_pct:.1f}% of dataset)",
                    "Consider imputation strategies",
                )
            )

        # Duplicate recommendations
        dup_count = self.df.duplicated().sum()
        if dup_count > 0:
            recommendations.append(
                (
                    "🟡 HIGH",
                    f"Remove {dup_count:,} duplicate rows",
                    "Use df.drop_duplicates() to clean data",
                )
            )

        # Correlation
        if len(self.numeric_cols) >= 2:
            corr = self.df[self.numeric_cols].corr()
            high_corr = (corr.abs() > 0.8) & (corr.abs() < 1.0)
            if high_corr.any().any():
                recommendations.append(
                    (
                        "🟡 HIGH",
                        "High correlation detected",
                        "Check for multicollinearity, consider VIF analysis",
                    )
                )

        # Feature engineering
        if len(self.numeric_cols) > 0:
            recommendations.append(
                (
                    "🟢 MEDIUM",
                    "Feature scaling recommended",
                    "Use StandardScaler or MinMaxScaler for ML models",
                )
            )

        if len(self.categorical_cols) > 0:
            recommendations.append(
                (
                    "🟢 MEDIUM",
                    "Encode categorical variables",
                    "Use OneHotEncoder or LabelEncoder",
                )
            )

        recommendations.append(
            (
                "🟢 MEDIUM",
                "Outlier detection and treatment",
                "Use IQR method or Z-score to identify outliers",
            )
        )
        recommendations.append(
            (
                "🟢 LOW",
                "Feature selection",
                "Use correlation analysis or feature importance",
            )
        )
        recommendations.append(
            (
                "🟢 LOW",
                "Train/test split",
                "Use 80/20 or 70/30 split with stratification",
            )
        )

        # Draw recommendations
        y_pos = 0.85
        for i, (priority, title, detail) in enumerate(recommendations):
            # Priority box
            box_color = (
                "#FFEBEE"
                if "🔴" in priority
                else "#FFF9C4" if "🟡" in priority else "#E8F5E9"
            )
            border_color = (
                self.accent_color
                if "🔴" in priority
                else self.warning_color if "🟡" in priority else self.success_color
            )

            rec_box = Rectangle(
                (0.05, y_pos - 0.08),
                0.9,
                0.08,
                transform=ax.transAxes,
                facecolor=box_color,
                edgecolor=border_color,
                linewidth=2,
            )
            ax.add_patch(rec_box)

            # Priority badge
            ax.text(
                0.08,
                y_pos - 0.04,
                priority,
                fontsize=9,
                fontweight="bold",
                ha="left",
                va="center",
                transform=ax.transAxes,
            )

            # Title
            ax.text(
                0.22,
                y_pos - 0.025,
                title,
                fontsize=11,
                fontweight="bold",
                ha="left",
                va="center",
                transform=ax.transAxes,
                color=self.primary_color,
            )

            # Detail
            ax.text(
                0.22,
                y_pos - 0.055,
                detail,
                fontsize=9,
                ha="left",
                va="center",
                transform=ax.transAxes,
                color="gray",
                style="italic",
            )

            y_pos -= 0.10

            if y_pos < 0.15:
                break

        # Footer with summary
        summary_box = Rectangle(
            (0.1, 0.02),
            0.8,
            0.08,
            transform=ax.transAxes,
            facecolor=self.bg_color,
            edgecolor=self.secondary_color,
            linewidth=2,
        )
        ax.add_patch(summary_box)

        ax.text(
            0.5,
            0.06,
            "💡 Tip: Address critical and high priority items before modeling",
            ha="center",
            va="center",
            fontsize=10,
            fontweight="bold",
            color=self.primary_color,
            transform=ax.transAxes,
        )

        pdf.savefig(fig, bbox_inches="tight", facecolor="white", dpi=300)
        plt.close()
