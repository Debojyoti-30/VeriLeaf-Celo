import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Scan, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { ImpactResults } from "@/components/ImpactResults";
import { vegetationAnalysisService, type AnalysisResults } from "@/services/vegetationAnalysis";

// Leaflet / React-Leaflet
import { MapContainer, TileLayer, useMapEvents, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface AnalysisResult {
  before: string;
  after: string;
  beforePath: string;
  afterPath: string;
}

export function MapInterface() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [tempPoint, setTempPoint] = useState<[number, number] | null>(null);
  const [beforeDate, setBeforeDate] = useState<string>('2023-01-01');
  const [afterDate, setAfterDate] = useState<string>('2025-10-01');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [aiResults, setAiResults] = useState<AnalysisResults | null>(null);

  const handleAnalyze = async () => {
    if (!geoJsonFeature) {
      // nothing to analyze
      return;
    }
    setIsAnalyzing(true);
    setShowResults(false);
    setAiResults(null);

    const payload = {
      geojson: geoJsonFeature,
      beforeDate,
      afterDate,
      windowDays: 14 // 15-day windows roughly
    };
    try {
      const r = await fetch('http://localhost:4000/api/sentinel/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error(await r.text());
      const data: AnalysisResult = await r.json();

      // Save imagery response from Sentinel server
      setAnalysisResult(data);

      // Call AI pipeline to compute real vegetation indices using saved file paths
      try {
        const results = await vegetationAnalysisService.analyzeVegetationByPaths({
          // Prefer the absolute paths returned by the server; fallback to deterministic names
          before_path: data.beforePath || 'before.jpg',
          after_path: data.afterPath || 'after.jpg',
        });
        setAiResults(results);
      } catch (aiErr) {
        // eslint-disable-next-line no-console
        console.error('AI analysis failed:', aiErr);
        alert('AI analysis failed. Please ensure the AI server is running on port 5000.');
      }

      setShowResults(true);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Analysis failed', e);
      alert('Analysis failed: ' + e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startDrawing = () => {
    setPoints([]);
    setTempPoint(null);
    setDrawing(true);
  };

  const finishDrawing = () => {
    setDrawing(false);
    setTempPoint(null);
  };

  const clearPolygon = () => {
    setPoints([]);
    setTempPoint(null);
    setDrawing(false);
  };

  // compute polygon area (spherical) in km^2 using the algorithm by
  // Chamberlain & Duquette: area = |sum((lon2-lon1)*(sin(lat1)+sin(lat2)))| * R^2 / 2
  const polygonAreaKm2 = (coords: [number, number][]) => {
    if (!coords || coords.length < 3) return 0;
    const R = 6378137; // Earth's radius in meters (WGS84)
    const rad = (deg: number) => (deg * Math.PI) / 180;
    let sum = 0;
    for (let i = 0; i < coords.length; i++) {
      const [lat1, lon1] = coords[i];
      const [lat2, lon2] = coords[(i + 1) % coords.length];
      sum += (rad(lon2) - rad(lon1)) * (Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
    }
    const area = Math.abs(sum) * (R * R) / 2.0; // area in square meters
    return area / 1e6; // km^2
  };

  // currentPoints includes tempPoint while drawing so area updates live
  const currentPoints = drawing && tempPoint ? [...points, tempPoint] : points;
  const areaKm2 = polygonAreaKm2(currentPoints);

  // memoized center
  const center = useMemo(() => [0, 0] as [number, number], []);

  const monthsBetween = (fromIso: string, toIso: string) => {
    try {
      const from = new Date(fromIso);
      const to = new Date(toIso);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) return 0;
      let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
      // adjust if day of month in 'to' is less than 'from'
      if (to.getDate() < from.getDate()) months -= 1;
      return Math.max(0, months);
    } catch (e) {
      return 0;
    }
  };
  const timeRangeMonths = monthsBetween(beforeDate, afterDate);

  // Format coordinates for display and export
  const displayPoints = currentPoints;
  const formatLatLng = (p: [number, number]) => `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`;
  const coordsText = displayPoints.length > 0 ? displayPoints.map(formatLatLng).join('\n') : '';

  const geoJsonFeature = displayPoints.length > 0 ? {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      // GeoJSON expects [lng, lat]
      coordinates: [[...displayPoints.map(p => [p[1], p[0]]), ...(displayPoints.length > 0 ? [[displayPoints[0][1], displayPoints[0][0]]] : [])]]
    }
  } : null;

  const copyCoords = async () => {
    if (!coordsText) return;
    try {
      await navigator.clipboard.writeText(coordsText);
      // small feedback could be added
    } catch (e) {
      // ignore
    }
  };

  const downloadGeoJSON = () => {
    if (!geoJsonFeature) return;
    const blob = new Blob([JSON.stringify(geoJsonFeature, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected-area.geojson';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  function ClickHandler() {
    useMapEvents({
      click(e) {
        if (!drawing) return;
        setPoints(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
      },
      mousemove(e) {
        if (!drawing) return;
        setTempPoint([e.latlng.lat, e.latlng.lng]);
      }
    });
    return null;
  }

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl md:text-5xl font-['Space_Grotesk'] font-bold">
              Verify Your Impact
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Draw your project area and analyze environmental changes
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Map with drawing */}
            <Card className="lg:col-span-2 p-4 bg-card">
              <div className="aspect-video rounded-lg border-2 border-dashed border-border relative overflow-hidden">
                {/* @ts-ignore: react-leaflet types mismatch in current tooling, runtime is fine */}
                <MapContainer center={center} zoom={2} style={{ height: '100%', width: '100%' }}>
                  {/* @ts-ignore: react-leaflet types mismatch in current tooling, runtime is fine */}
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <ClickHandler />
                  {/* show drawing polygon: include tempPoint to give rubberband while drawing */}
                  {points.length > 0 && (
                    <Polygon positions={points.map(p => [p[0], p[1]])} pathOptions={{ color: '#10b981' }} />
                  )}
                  {drawing && points.length > 0 && tempPoint && (
                    <Polygon
                      positions={[...points, tempPoint].map(p => [p[0], p[1]])}
                      pathOptions={{ dashArray: '6', color: '#34d399' }}
                    />
                  )}
                </MapContainer>
                <div className="absolute top-3 left-3 z-[9999] space-x-2 pointer-events-auto">
                  {!drawing ? (
                    <Button size="sm" onClick={startDrawing}>Start Drawing</Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={finishDrawing} className="mr-2">Finish</Button>
                      <Button size="sm" variant="outline" onClick={clearPolygon}>Cancel</Button>
                    </>
                  )}
                </div>
                <div className="absolute top-3 right-3 z-[9999] pointer-events-auto">
                  <Button size="sm" variant="destructive" onClick={clearPolygon} disabled={points.length === 0}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Polygon
                  </Button>
                </div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--accent)/0.02),transparent_70%)] pointer-events-none" />
              </div>
            </Card>

            {/* Controls */}
            <Card className="p-6 bg-card space-y-6">
              <div className="space-y-4">
                <h3 className="font-['Space_Grotesk'] font-semibold text-lg">Analysis Parameters</h3>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-accent" />
                      Before Date
                    </label>
                    <input 
                      type="date" 
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      value={beforeDate}
                      onChange={(e) => setBeforeDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-accent" />
                      After Date
                    </label>
                    <input 
                      type="date" 
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      value={afterDate}
                      onChange={(e) => setAfterDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Area Selected</span>
                  <span className="font-medium">{areaKm2 ? areaKm2.toFixed(2) : '0.00'} km²</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Time Range</span>
                  <span className="font-medium">{timeRangeMonths} months</span>
                </div>
              </div>

              {/* Coordinates export / display */}
              <div className="pt-4">
                <h4 className="text-sm font-medium mb-2">Selected Coordinates</h4>
                <div className="flex gap-2 items-start">
                  <textarea
                    readOnly
                    value={coordsText}
                    rows={6}
                    className="flex-1 text-xs p-2 rounded border border-input bg-background resize-none"
                  />
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={copyCoords} disabled={!coordsText}>Copy</Button>
                    <Button size="sm" variant="outline" onClick={downloadGeoJSON} disabled={!geoJsonFeature}>Download GeoJSON</Button>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full bg-gradient-accent hover:opacity-90 shadow-eco"
              >
                {isAnalyzing ? (
                  <>
                    <Scan className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Scan className="h-4 w-4 mr-2" />
                    Run Analysis
                  </>
                )}
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {/* Impact Analysis Results */}
      {showResults && analysisResult && (
        <ImpactResults 
          analysisData={analysisResult}
          areaKm2={areaKm2}
          timeRangeMonths={timeRangeMonths}
          aiResults={aiResults || undefined}
        />
      )}
    </section>
  );
}
