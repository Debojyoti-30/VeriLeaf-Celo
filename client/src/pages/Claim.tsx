import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapContainer, TileLayer, useMapEvents, Polygon } from "react-leaflet";
import { stringToHex } from "viem";
import { useAccount, useWriteContract, useChainId } from "wagmi";
import { celo, celoAlfajores, sepolia } from "wagmi/chains";
import { CLAIMS_ABI } from "@/contracts/abis/Claims";
import { CLAIMS_CONTRACT_ADDRESS, isContractsConfigured } from "@/config/contracts";

type LatLng = [number, number]; // [lat, lng]

function ClickHandler({ drawing, setPoints, setTempPoint }: {
  drawing: boolean;
  setPoints: React.Dispatch<React.SetStateAction<LatLng[]>>;
  setTempPoint: React.Dispatch<React.SetStateAction<LatLng | null>>;
}) {
  useMapEvents({
    click(e) {
      if (!drawing) return;
      setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    },
    mousemove(e) {
      if (!drawing) return;
      setTempPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function Claim() {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [tempPoint, setTempPoint] = useState<LatLng | null>(null);
  const [locationName, setLocationName] = useState("");
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const currentChain = chainId === celo.id ? celo : chainId === celoAlfajores.id ? celoAlfajores : chainId === sepolia.id ? sepolia : celoAlfajores;

  const currentPoints = drawing && tempPoint ? [...points, tempPoint] : points;
  const center = useMemo(() => [0, 0] as LatLng, []);

  const geoJsonFeature = currentPoints.length > 0 ? {
    type: "Feature",
    properties: { owner: address ?? null, name: locationName || null },
    geometry: {
      type: "Polygon",
      coordinates: [[
        ...currentPoints.map((p) => [p[1], p[0]]),
        ...(currentPoints.length > 0 ? [[currentPoints[0][1], currentPoints[0][0]]] : []),
      ]],
    },
  } : null;

  // Workaround for react-leaflet typing in this setup
  const MapContainerLoose = MapContainer as unknown as React.ComponentType<Record<string, unknown>>;

  const startDrawing = () => {
    setPoints([]);
    setTempPoint(null);
    setDrawing(true);
    setLocationName("");
  };
  const finishDrawing = () => {
    setDrawing(false);
    setTempPoint(null);
    // Attempt to auto-fill location name when a polygon is complete
    if (currentPoints.length >= 3) {
      const [clat, clon] = centroidLatLng(currentPoints);
      reverseGeocode(clat, clon).then((name) => {
        if (name) setLocationName(name);
      });
    }
  };
  const clearPolygon = () => {
    setPoints([]);
    setTempPoint(null);
    setDrawing(false);
  };

  const onRegisterClaim = async () => {
    if (!isConnected) {
      alert("Please connect your wallet to register a claim.");
      return;
    }
    if (!isContractsConfigured()) {
      alert("Contract address not configured. Set VITE_CLAIMS_CONTRACT_ADDRESS in .env");
      return;
    }
    if (!geoJsonFeature || !locationName.trim()) {
      alert("Please draw an area and provide a location name.");
      return;
    }
    try {
      setSubmitting(true);
      const geojsonString = JSON.stringify(geoJsonFeature);
      const geojsonBytes = stringToHex(geojsonString);
      await writeContractAsync({
        address: CLAIMS_CONTRACT_ADDRESS as `0x${string}`,
        abi: CLAIMS_ABI,
        functionName: "registerClaim",
        args: [geojsonBytes, locationName.trim()],
        chain: currentChain,
        account: address as `0x${string}`,
      });
      alert("Claim registered on-chain.");
      clearPolygon();
      setLocationName("");
    } catch (e: unknown) {
      console.error(e);
      alert((e as Error).message || "Failed to register claim");
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-fetch name when polygon is ready and user hasn't typed one
  const pointsReady = !drawing && currentPoints.length >= 3;
  useEffect(() => {
    if (!pointsReady || locationName || isFetchingName) return;
    const [clat, clon] = centroidLatLng(currentPoints);
    setIsFetchingName(true);
    reverseGeocode(clat, clon)
      .then((name) => {
        if (name && !locationName) setLocationName(name);
      })
      .finally(() => setIsFetchingName(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsReady, locationName]);

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-4 bg-card">
            <div className="aspect-video rounded-lg border-2 border-dashed border-border relative overflow-hidden">
              <MapContainerLoose center={center} zoom={2} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ClickHandler drawing={drawing} setPoints={setPoints} setTempPoint={setTempPoint} />
                {points.length > 0 && (
                  <Polygon positions={points.map((p) => [p[0], p[1]])} pathOptions={{ color: "#10b981" }} />
                )}
                {drawing && points.length > 0 && tempPoint && (
                  <Polygon positions={[...points, tempPoint].map((p) => [p[0], p[1]])} pathOptions={{ dashArray: "6", color: "#34d399" }} />
                )}
              </MapContainerLoose>

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
            </div>
          </Card>
          <Card className="p-6 bg-card space-y-4">
            <div className="space-y-2">
              <Label htmlFor="locationName">Location name</Label>
              <Input id="locationName" placeholder="e.g. Green Valley Block-1" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
              {isFetchingName && <p className="text-xs text-muted-foreground">Fetching location name…</p>}
            </div>
            <Button className="w-full" disabled={!geoJsonFeature || !locationName || submitting} onClick={onRegisterClaim}>
              {submitting ? "Registering..." : "Register Claim"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Your polygon is stored on-chain and linked to your wallet. Our backend will use it to fetch Sentinel data for verification.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}

// Helpers
function centroidLatLng(points: LatLng[]): LatLng {
  if (!points.length) return [0, 0];
  let lat = 0, lng = 0;
  for (const [la, ln] of points) { lat += la; lng += ln; }
  return [lat / points.length, lng / points.length];
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const data = await r.json();
    const name = data?.display_name as string | undefined;
    return name ?? null;
  } catch {
    return null;
  }
}

