/** Typed client for the Kansoku API. Types mirror backend/kansoku/contracts.py. */

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type FaultClass = "healthy" | "ball" | "inner_race" | "outer_race";

export interface SignificanceRow {
  feature: string;
  domain: "time" | "frequency" | "wavelet";
  test_used: "anova" | "kruskal_wallis";
  levene_p: number;
  statistic: number;
  p_value: number;
  eta_squared: number;
  passes_gate: boolean;
  separated_pairs: string[];
}

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface LeaderboardRow {
  model_name: string;
  accuracy: number;
  macro_f1: number;
  cv_mean: number;
  cv_std: number;
  inference_latency_ms: number;
  per_class: Record<string, ClassMetrics>;
  confusion_matrix: number[][];
  class_order: string[];
}

export interface ClusterPoint {
  segment_id: string;
  pc1: number;
  pc2: number;
  pc3: number;
  cluster: number;
  true_label: FaultClass;
  severity: number;
  load_hp: number;
}

export interface ClusterResponse {
  points: ClusterPoint[];
  sweep: { k: number; inertia: number; silhouette: number }[];
  chosen_k: number;
  explained_variance: number[];
  cluster_composition: Record<string, Record<string, number>>;
}

export interface SignalResponse {
  segment_id: string;
  label: FaultClass;
  sampling_rate: number;
  waveform: number[];
  fft_freqs: number[];
  fft_magnitude: number[];
}

export interface SegmentRef {
  segment_id: string;
  label: FaultClass;
  severity: number;
  load_hp: number;
}

export interface DrivingFeature {
  name: string;
  value: number;
  eta_squared: number;
  contribution: number;
}

export interface PredictionResponse {
  predicted_class: FaultClass;
  confidence: number;
  class_probabilities: Record<string, number>;
  driving_features: DrivingFeature[];
  model_name: string;
  model_version: string;
  latency_ms: number;
}

export interface Manifest {
  version: string;
  seed: number;
  trained_at: string;
  n_segments: number;
  feature_count: number;
  features: string[];
  classes: FaultClass[];
  best_model: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  manifest: () => get<Manifest>("/manifest"),
  significance: () => get<SignificanceRow[]>("/significance"),
  leaderboard: () => get<LeaderboardRow[]>("/leaderboard"),
  clusters: () => get<ClusterResponse>("/clusters"),
  segments: (limit = 40) => get<SegmentRef[]>(`/segments?limit=${limit}`),
  /** Segment ids contain '#', which a URL would swallow as a fragment, so the
   *  id is split and passed as path parts. */
  signal: (segmentId: string) => {
    const [fileId, idx] = segmentId.split("#");
    return get<SignalResponse>(`/signal/${fileId}/${idx}`);
  },
  predict: async (file: File): Promise<PredictionResponse> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API}/predict`, { method: "POST", body });
    if (!res.ok) {
      const { detail } = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(detail ?? "prediction failed");
    }
    return res.json();
  },
};

export const CLASS_COLOR: Record<string, string> = {
  healthy: "var(--c-healthy)",
  ball: "var(--c-ball)",
  inner_race: "var(--c-inner_race)",
  outer_race: "var(--c-outer_race)",
};

export const CLASS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  ball: "Ball",
  inner_race: "Inner Race",
  outer_race: "Outer Race",
};

export const fmtPct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
