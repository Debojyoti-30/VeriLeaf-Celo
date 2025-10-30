/**
 * Vegetation Analysis Service
 * Communicates with the Python AI pipeline for vegetation analysis
 */

export interface VegetationMetrics {
  ndvi_mean: number;
  ndvi_std: number;
  ndvi_max: number;
  ndvi_min: number;
  evi_mean: number;
  evi_std: number;
  evi_max: number;
  evi_min: number;
  ndwi_mean: number;
  ndwi_std: number;
  ndwi_max: number;
  ndwi_min: number;
  savi_mean: number;
  savi_std: number;
  savi_max: number;
  savi_min: number;
  lai_mean: number;
  lai_std: number;
  lai_max: number;
  lai_min: number;
  fvc_mean: number;
  fvc_std: number;
  fvc_max: number;
  fvc_min: number;
}

export interface ImpactAnalysis {
  impact_score: number;
  confidence: number;
  category: string;
  ndvi_change_percent: number;
  evi_change_percent: number;
  fvc_change_percent: number;
  lai_change_percent: number;
  weighted_score: number;
}

export interface AnalysisResults {
  timestamp: string;
  before_image: string;
  after_image: string;
  before_metrics: VegetationMetrics;
  after_metrics: VegetationMetrics;
  impact_analysis: ImpactAnalysis;
  status: 'success' | 'error';
  error?: string;
  session_id?: string;
}

export interface AnalysisRequest {
  before_path: string;
  after_path: string;
}

export type MetricsInfo = Record<string, unknown>;

class VegetationAnalysisService {
  private baseUrl: string;

  constructor() {
    // Use environment variable or default to localhost
    this.baseUrl = import.meta.env.VITE_AI_API_URL || 'http://localhost:5000';
  }

  /**
   * Analyze vegetation changes between before and after images
   */
  async analyzeVegetation(beforeImage: File, afterImage: File): Promise<AnalysisResults> {
    try {
      const formData = new FormData();
      formData.append('before', beforeImage);
      formData.append('after', afterImage);

      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const results = await response.json();
      return results;
    } catch (error) {
      console.error('Vegetation analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze vegetation changes using file paths
   */
  async analyzeVegetationByPaths(request: AnalysisRequest): Promise<AnalysisResults> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze/paths`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const results = await response.json();
      return results;
    } catch (error) {
      console.error('Vegetation analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get analysis results by session ID
   */
  async getResults(sessionId: string): Promise<AnalysisResults> {
    try {
      const response = await fetch(`${this.baseUrl}/results/${sessionId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const results = await response.json();
      return results;
    } catch (error) {
      console.error('Failed to retrieve results:', error);
      throw error;
    }
  }

  /**
   * Get available metrics information
   */
  async getMetricsInfo(): Promise<MetricsInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const metricsInfo = await response.json();
      return metricsInfo;
    } catch (error) {
      console.error('Failed to get metrics info:', error);
      throw error;
    }
  }

  /**
   * Check if the AI service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Format impact score for display
   */
  formatImpactScore(score: number): string {
    return `${score.toFixed(1)}/100`;
  }

  /**
   * Get impact category color
   */
  getImpactCategoryColor(category: string): string {
    switch (category.toLowerCase()) {
      case 'excellent':
        return 'text-green-600 dark:text-green-400';
      case 'good':
        return 'text-blue-600 dark:text-blue-400';
      case 'moderate':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'poor':
        return 'text-orange-600 dark:text-orange-400';
      case 'very poor':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  /**
   * Get impact category badge variant
   */
  getImpactCategoryBadgeVariant(category: string): string {
    switch (category.toLowerCase()) {
      case 'excellent':
        return 'bg-green-500/10 text-green-600 dark:text-green-400';
      case 'good':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'moderate':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
      case 'poor':
        return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
      case 'very poor':
        return 'bg-red-500/10 text-red-600 dark:text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
    }
  }

  /**
   * Calculate CO2 offset estimate based on vegetation metrics
   */
  calculateCO2Offset(impactScore: number, areaKm2: number): number {
    // Rough estimate: 1 point of impact score = ~1.5 tons CO2 per km²
    const baseOffset = (impactScore / 100) * 1.5;
    return Math.round(baseOffset * areaKm2);
  }

  /**
   * Generate analysis summary
   */
  generateAnalysisSummary(results: AnalysisResults): string {
    const { impact_analysis } = results;
    const { impact_score, category, confidence } = impact_analysis;

    let summary = `Environmental impact analysis shows ${category.toLowerCase()} results `;
    summary += `with an impact score of ${impact_score.toFixed(1)}/100. `;
    
    if (confidence >= 80) {
      summary += "High confidence in the analysis results.";
    } else if (confidence >= 60) {
      summary += "Moderate confidence in the analysis results.";
    } else {
      summary += "Lower confidence in the analysis results.";
    }

    return summary;
  }
}

// Export singleton instance
export const vegetationAnalysisService = new VegetationAnalysisService();
export default vegetationAnalysisService;
