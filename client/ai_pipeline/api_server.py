"""
VeriLeaf AI Pipeline - Flask API Server

This server accepts before/after images and computes vegetation indices:
- NDVI (visible approximation)
- EVI  (visible approximation)
- NDWI (visible variant)
- SAVI (visible approximation)
- LAI  (derived from FVC)
- FVC  (derived from NDVI)

Endpoints:
- POST /analyze           (multipart form-data: before, after)
- POST /analyze/paths     (JSON: { before_path, after_path })
- GET  /results/<id>      (retrieve saved results)
- GET  /metrics           (index descriptions)
- GET  /health            (health check)

Notes:
- Indices are computed from RGB images using visible-band approximations
  (true NDVI/EVI typically require NIR; for RGB we use proxies).
- Results are saved to ai_pipeline/results/<session_id>.json
- Uploaded files are saved under ai_pipeline/uploads
"""
from __future__ import annotations

import base64
import io
import json
import os
import uuid
from datetime import datetime
from typing import Dict, Any, Tuple, Optional

import numpy as np
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Try to use OpenCV if available for robust decoding; fall back to PIL
try:
    import cv2  # type: ignore
    HAS_CV2 = True
except Exception:
    HAS_CV2 = False

try:
    from PIL import Image  # type: ignore
    HAS_PIL = True
except Exception:
    HAS_PIL = False

# ----------------------------------------------------------------------------
# Paths and app setup
# ----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
RESULTS_DIR = os.path.join(BASE_DIR, 'results')

os.makedirs(UPLOAD_DIR, exist_ok=True)
(os.makedirs(RESULTS_DIR, exist_ok=True))

app = Flask(__name__)
CORS(app)

EPS = 1e-6

# ----------------------------------------------------------------------------
# Utilities
# ----------------------------------------------------------------------------

def _to_rgb_array_from_bytes(data: bytes) -> np.ndarray:
    """Decode image bytes into an RGB numpy array (H, W, 3), float32 in [0, 1]."""
    if HAS_CV2:
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError('Failed to decode image bytes with OpenCV')
        # OpenCV decodes as BGR; convert to RGB
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    elif HAS_PIL:
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert('RGB')
            img = np.array(im)
    else:
        raise RuntimeError('Neither OpenCV nor Pillow is available for image decoding')

    img = img.astype(np.float32) / 255.0
    return img


def _read_image_from_path(path: str) -> np.ndarray:
    """Read image from a filesystem path into RGB float32 [0,1] array."""
    if not os.path.isabs(path):
        # Try a few candidate roots for relative paths
        candidates = [
            os.getcwd(),
            os.path.abspath(os.path.join(os.getcwd(), '..')),
            os.path.abspath(os.path.join(os.getcwd(), '..', 'server', 'output')),
            BASE_DIR,
            os.path.abspath(os.path.join(BASE_DIR, '..')),
            os.path.abspath(os.path.join(BASE_DIR, '..', 'server', 'output')),
        ]
        for root in candidates:
            candidate = os.path.join(root, path)
            if os.path.exists(candidate):
                path = candidate
                break
    if not os.path.exists(path):
        raise FileNotFoundError(f'Image not found: {path}')

    with open(path, 'rb') as f:
        data = f.read()
    return _to_rgb_array_from_bytes(data)


def _save_upload(file_storage, prefix: str) -> str:
    """Save uploaded file to uploads dir and return saved path."""
    ext = ''
    if hasattr(file_storage, 'filename') and file_storage.filename:
        _, ext = os.path.splitext(file_storage.filename)
    filename = f"{prefix}_{uuid.uuid4().hex}{ext or '.jpg'}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    file_storage.save(save_path)
    return save_path


def _to_data_url(img: np.ndarray, fmt: str = 'JPEG') -> str:
    """Convert RGB float32 [0,1] array to a Base64 data URL string."""
    if HAS_PIL:
        im = Image.fromarray(np.clip(img * 255.0, 0, 255).astype(np.uint8), mode='RGB')
        buf = io.BytesIO()
        im.save(buf, format=fmt)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        mime = 'image/jpeg' if fmt.upper() == 'JPEG' else 'image/png'
        return f"data:{mime};base64,{b64}"
    else:
        # Minimal fallback using OpenCV
        if not HAS_CV2:
            raise RuntimeError('Cannot encode image without PIL or OpenCV')
        bgr = cv2.cvtColor((img * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode('.jpg', bgr)
        if not ok:
            raise ValueError('Failed to encode image')
        b64 = base64.b64encode(buf.tobytes()).decode('ascii')
        return f"data:image/jpeg;base64,{b64}"


# ----------------------------------------------------------------------------
# Vegetation indices (visible approximations for RGB)
# ----------------------------------------------------------------------------

def _compute_indices(rgb: np.ndarray) -> Dict[str, np.ndarray]:
    """Compute vegetation index rasters from an RGB image (float32 [0,1]).

    Visible-band approximations:
    - vNDVI ≈ (G - R) / (G + R)
    - EVI   ≈ 2.5 * (G - R) / (G + 6*R - 7.5*B + 1)
    - NDWI  ≈ (G - B) / (G + B)
    - SAVI  ≈ 1.5 * (G - R) / (G + R + 0.5)
    - FVC   derived from NDVI (clamped 0..1)
    - LAI   derived from FVC: -ln(1 - FVC + EPS)
    """
    R = rgb[..., 0]
    G = rgb[..., 1]
    B = rgb[..., 2]

    vndvi = (G - R) / (G + R + EPS)
    evi = 2.5 * (G - R) / (G + 6.0 * R - 7.5 * B + 1.0 + EPS)
    ndwi = (G - B) / (G + B + EPS)
    savi = 1.5 * (G - R) / (G + R + 0.5 + EPS)

    # Derive FVC from NDVI using typical soil/veg anchors (visible proxy)
    ndvi_soil = 0.2
    ndvi_veg = 0.86
    fvc = np.clip((vndvi - ndvi_soil) / (ndvi_veg - ndvi_soil + EPS), 0.0, 1.0) ** 2

    # LAI from FVC (simple Beer-Lambert approximation)
    lai = -np.log(1.0 - np.clip(fvc, 0.0, 0.99) + EPS)

    return {
        'ndvi': np.clip(vndvi, -1.0, 1.0),
        'evi': np.clip(evi, -1.0, 1.0),
        'ndwi': np.clip(ndwi, -1.0, 1.0),
        'savi': np.clip(savi, -1.0, 1.0),
        'fvc': np.clip(fvc, 0.0, 1.0),
        'lai': np.clip(lai, 0.0, 6.0),  # cap to a reasonable LAI range
    }


def _metrics_summary(arr: np.ndarray) -> Dict[str, float]:
    return {
        'mean': float(np.nanmean(arr)),
        'std': float(np.nanstd(arr)),
        'max': float(np.nanmax(arr)),
        'min': float(np.nanmin(arr)),
    }


def _compute_metrics(rgb: np.ndarray) -> Dict[str, float]:
    idx = _compute_indices(rgb)
    out: Dict[str, float] = {}
    for key, data in idx.items():
        s = _metrics_summary(data)
        out[f'{key}_mean'] = s['mean']
        out[f'{key}_std'] = s['std']
        out[f'{key}_max'] = s['max']
        out[f'{key}_min'] = s['min']
    return out


def _impact_analysis(before: Dict[str, float], after: Dict[str, float]) -> Dict[str, Any]:
    def change_pct(metric: str) -> float:
        b = before.get(f'{metric}_mean', 0.0)
        a = after.get(f'{metric}_mean', 0.0)
        return float(((a - b) / (abs(b) + EPS)) * 100.0)

    ndvi_ch = change_pct('ndvi')
    evi_ch = change_pct('evi')
    fvc_ch = change_pct('fvc')
    lai_ch = change_pct('lai')

    weighted = 0.4 * ndvi_ch + 0.2 * evi_ch + 0.2 * fvc_ch + 0.2 * lai_ch
    impact_score = float(np.clip(50.0 + weighted / 2.0, 0.0, 100.0))

    if impact_score >= 80:
        category = 'Excellent'
    elif impact_score >= 65:
        category = 'Good'
    elif impact_score >= 50:
        category = 'Moderate'
    elif impact_score >= 35:
        category = 'Poor'
    else:
        category = 'Very Poor'

    # Confidence heuristic based on image size and metric stability
    conf = 70.0
    # Penalize very noisy changes
    noise = sum(
        abs(before.get(f'{m}_std', 0) - after.get(f'{m}_std', 0)) for m in ['ndvi', 'evi', 'fvc', 'lai']
    )
    conf = float(np.clip(conf - noise * 5.0, 50.0, 95.0))

    return {
        'impact_score': impact_score,
        'confidence': conf,
        'category': category,
        'ndvi_change_percent': ndvi_ch,
        'evi_change_percent': evi_ch,
        'fvc_change_percent': fvc_ch,
        'lai_change_percent': lai_ch,
        'weighted_score': weighted,
    }


def _build_results(before_rgb: np.ndarray, after_rgb: np.ndarray) -> Dict[str, Any]:
    before_metrics = _compute_metrics(before_rgb)
    after_metrics = _compute_metrics(after_rgb)

    results: Dict[str, Any] = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'before_image': _to_data_url(before_rgb),
        'after_image': _to_data_url(after_rgb),
        'before_metrics': before_metrics,
        'after_metrics': after_metrics,
        'impact_analysis': _impact_analysis(before_metrics, after_metrics),
        'status': 'success',
    }
    return results


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@app.route('/health', methods=['GET'])
def health() -> Any:
    return jsonify({'status': 'ok'})


@app.route('/metrics', methods=['GET'])
def metrics_info() -> Any:
    info = {
        'ndvi': 'Visible NDVI approximation: (G - R) / (G + R) from RGB.',
        'evi': 'Visible EVI approximation: 2.5 * (G - R) / (G + 6R - 7.5B + 1).',
        'ndwi': 'Visible NDWI variant: (G - B) / (G + B).',
        'savi': 'SAVI approximation (L=0.5): 1.5 * (G - R) / (G + R + 0.5).',
        'fvc': 'Fractional Vegetation Cover derived from NDVI (0..1).',
        'lai': 'Leaf Area Index derived from FVC via Beer-Lambert approximation.',
    }
    return jsonify(info)


@app.route('/analyze', methods=['POST'])
def analyze_uploads() -> Any:
    before_file = request.files.get('before')
    after_file = request.files.get('after')
    if not before_file or not after_file:
        return jsonify({'status': 'error', 'error': 'Missing files: before and/or after'}), 400

    # Save uploads (optional but helpful for tracing)
    before_path = _save_upload(before_file, 'before')
    after_path = _save_upload(after_file, 'after')

    try:
        with open(before_path, 'rb') as fb:
            before_rgb = _to_rgb_array_from_bytes(fb.read())
        with open(after_path, 'rb') as fa:
            after_rgb = _to_rgb_array_from_bytes(fa.read())

        results = _build_results(before_rgb, after_rgb)
        session_id = uuid.uuid4().hex
        results['session_id'] = session_id

        # Persist results
        with open(os.path.join(RESULTS_DIR, f'{session_id}.json'), 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        return jsonify(results)
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/analyze/paths', methods=['POST'])
def analyze_by_paths() -> Any:
    try:
        data = request.get_json(silent=True) or {}
        before_path = data.get('before_path')
        after_path = data.get('after_path')
        if not before_path or not after_path:
            return jsonify({'status': 'error', 'error': 'Missing before_path or after_path'}), 400

        before_rgb = _read_image_from_path(before_path)
        after_rgb = _read_image_from_path(after_path)

        results = _build_results(before_rgb, after_rgb)
        session_id = uuid.uuid4().hex
        results['session_id'] = session_id

        with open(os.path.join(RESULTS_DIR, f'{session_id}.json'), 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        return jsonify(results)
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/results/<session_id>', methods=['GET'])
def get_results(session_id: str) -> Any:
    path = os.path.join(RESULTS_DIR, f'{session_id}.json')
    if not os.path.exists(path):
        return jsonify({'status': 'error', 'error': 'Session not found'}), 404
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)


if __name__ == '__main__':
    # Allow PORT override via env (default 5000)
    port = int(os.getenv('AI_SERVER_PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=False)
