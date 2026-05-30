"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

type Waypoint = { lat: number; lon: number };

type IncidentMarker = {
  id: string | number;
  lat: number;
  lon: number;
  label?: string;
  accent?: "rose" | "amber" | "cyan";
};

type RouteMapProps = {
  viajeId?: string | number;
  waypoints?: Waypoint[];
  onAddWaypoint?: (point: Waypoint) => void;
  onMapClick?: (coords: { lat: number; lon: number }) => void;
  mode?: "setup" | "view" | string;
  center?: [number, number];
  zoom?: number;
  routePreviewApiUrl?: string;
  incidentMarkers?: IncidentMarker[];
  telemetryPoints?: Array<{ lat: number | string; lon: number | string; temp?: number; bateria?: number | null; humedad?: number | null }>;
};

type PreviewStatus = "idle" | "loading" | "osrm" | "fallback";

export default function RouteMap({
  viajeId,
  waypoints = [],
  onAddWaypoint,
  onMapClick,
  center = [13.6929, -89.2182],
  zoom = 12,
  routePreviewApiUrl,
  incidentMarkers = [],
  telemetryPoints = [],
}: RouteMapProps) {
  const [leaflet, setLeaflet] = useState<null | typeof import("leaflet")>(null);
  const [previewRoute, setPreviewRoute] = useState<Waypoint[] | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const addRef = useRef(onAddWaypoint);
  const mapClickRef = useRef(onMapClick);
  const resizeTimeoutRef = useRef<number | null>(null);
  const lastFittedViajeId = useRef<string | number | null>(null);
  const lastFittedWaypointsKey = useRef<string>("");

  useEffect(() => {
    addRef.current = onAddWaypoint;
    mapClickRef.current = onMapClick;
  }, [onAddWaypoint, onMapClick]);

  useEffect(() => {
    let active = true;

    if (typeof window === "undefined") {
      return undefined;
    }

    import("leaflet").then((mod) => {
      if (active) {
        setLeaflet(mod);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !containerRef.current || mapRef.current) {
      return;
    }

    const currentContainer = containerRef.current;
    const map = leaflet.map(currentContainer).setView(center, zoom);
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
      })
      .addTo(map);

    const layerGroup = leaflet.layerGroup().addTo(map);

    if (resizeTimeoutRef.current != null) {
      window.clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
      const coords = { lat: event.latlng.lat, lon: event.latlng.lng };
      addRef.current?.(coords);
      mapClickRef.current?.(coords);
    });

    mapRef.current = map;
    layerRef.current = layerGroup;

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;

      if (resizeTimeoutRef.current != null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      if (currentContainer && "_leaflet_id" in currentContainer) {
        (currentContainer as unknown as { _leaflet_id?: number })._leaflet_id = undefined;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaflet]);

  const centerLat = center[0];
  const centerLon = center[1];
  useEffect(() => {
    if (mapRef.current && leaflet) {
      mapRef.current.setView([centerLat, centerLon], zoom, { animate: false });
    }
  }, [centerLat, centerLon, zoom, leaflet]);

  useEffect(() => {
    if (!layerRef.current || !leaflet || !containerRef.current?.isConnected) {
      return;
    }

    layerRef.current.clearLayers();

    const bounds = leaflet.latLngBounds([]);
    const routeToDraw = previewRoute ?? (routePreviewApiUrl ? null : waypoints);

    waypoints.forEach((point) => {
      const marker = leaflet
        .circleMarker([point.lat, point.lon], {
          radius: 7,
          color: "#9ca3af",
          weight: 2,
          fillColor: "#000000",
          fillOpacity: 1,
        })
        .addTo(layerRef.current!);
      bounds.extend(marker.getLatLng());
    });

    (incidentMarkers ?? []).forEach((incidentMarker) => {
      const accentColor = "#ffffff";

      const marker = leaflet
        .circleMarker([incidentMarker.lat, incidentMarker.lon], {
          radius: 9,
          color: accentColor,
          weight: 2,
          fillColor: "#000000",
          fillOpacity: 1,
        })
        .addTo(layerRef.current!);

      if (incidentMarker.label) {
        marker.bindTooltip(incidentMarker.label, { direction: "top", sticky: true });
      }

      bounds.extend(marker.getLatLng());
    });

    const shouldDrawRoute = routeToDraw && routeToDraw.length > 1 && (previewStatus !== "fallback" || !viajeId);
    if (shouldDrawRoute) {
      const routeLine = leaflet
        .polyline(
          routeToDraw!.map((point) => [point.lat, point.lon]),
          {
            color: "#9ca3af",
            weight: 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          },
        )
        .addTo(layerRef.current!);

      bounds.extend(routeLine.getBounds());
    }

    if (telemetryPoints && telemetryPoints.length > 0) {
      const pathPoints = telemetryPoints
        .map((p) => {
          const lat = Number(p.lat);
          const lon = Number(p.lon);
          return [lat, lon] as [number, number];
        })
        .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

      if (pathPoints.length > 1) {
        const poly = leaflet
          .polyline(pathPoints, {
            color: "#9ca3af",
            weight: 3,
            dashArray: "4, 6",
            opacity: 0.8,
          })
          .addTo(layerRef.current!);
        bounds.extend(poly.getBounds());
      }

      if (pathPoints.length > 0) {
        const lastPoint = pathPoints[pathPoints.length - 1];
        const lastTele = telemetryPoints[telemetryPoints.length - 1];
        const tempVal = lastTele.temp;
        
        const referencePoints = (routeToDraw && routeToDraw.length > 0) ? routeToDraw : waypoints;
        let nearestWp = referencePoints[0];
        let minD = Infinity;
        let isDeviated = false;
        if (referencePoints.length > 0) {
          for (const wp of referencePoints) {
            const d = Math.pow(wp.lat - lastPoint[0], 2) + Math.pow(wp.lon - lastPoint[1], 2);
            if (d < minD) {
              minD = d;
              nearestWp = wp;
            }
          }
          isDeviated = Math.sqrt(minD) > 0.0045;
        }

        if (isDeviated && nearestWp) {
          const devLine = leaflet
            .polyline([[nearestWp.lat, nearestWp.lon], lastPoint], {
              color: "#9ca3af",
              weight: 2,
              dashArray: "3, 5",
              opacity: 0.95,
            })
            .addTo(layerRef.current!);
          bounds.extend(devLine.getBounds());
        }

        const isBatteryCritical = lastTele.bateria != null && lastTele.bateria <= 5;
        const iconColor = "bg-black border-white/10 shadow-none";
        
        const truckIcon = leaflet.divIcon({
          html: `<div class="relative flex h-6 w-6 items-center justify-center rounded-full ${iconColor} animate-pulse">
            <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124l-.318-5.085a2.25 2.25 0 0 0-2.247-2.115H16.5V9.75A2.25 2.25 0 0 0 14.25 7.5H5.25A2.25 2.25 0 0 0 3 9.75v5.625c0 .621.504 1.125 1.125 1.125H5.25m14-5.25L16.5 7.5h-3m3 4.5h2" />
            </svg>
          </div>`,
          className: "custom-truck-icon",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = leaflet
          .marker(lastPoint, { icon: truckIcon })
          .addTo(layerRef.current!)
          .bindTooltip(`Camión: ${tempVal}°C | Batería: ${lastTele.bateria ?? 'N/A'}% ${isDeviated ? '[Desviado]' : ''}`, { 
            direction: "top", 
            permanent: true,
            offset: [0, -10],
            className: "bg-black border border-white/8 text-[10px] text-white font-mono rounded px-2 py-1"
          });
        
        bounds.extend(marker.getLatLng());
      }
    }

    const map = mapRef.current;

    if (!map || !map.getContainer()?.isConnected) {
      return;
    }

    const container = map.getContainer();
    const hasVisibleSize = container.clientWidth > 0 && container.clientHeight > 0;

    window.requestAnimationFrame(() => {
      if (!mapRef.current || !mapRef.current.getContainer()?.isConnected) {
        return;
      }

      if (!hasVisibleSize) {
        return;
      }

      try {
        map.invalidateSize();

        if (bounds.isValid()) {
          const isNewViaje = viajeId && (viajeId !== lastFittedViajeId.current);
          
          // Serialize waypoints and whether route is loaded to prevent refitting on zoom/pan or async route loads
          const waypointsKey = waypoints.map(w => `${w.lat.toFixed(5)},${w.lon.toFixed(5)}`).join(';') + `|route:${!!routeToDraw}`;
          const isSetupMode = !viajeId && (waypointsKey !== lastFittedWaypointsKey.current);
          
          if (isNewViaje || isSetupMode) {
            let fitted = false;
            if (routeToDraw && routeToDraw.length > 1) {
              map.fitBounds(bounds.pad(0.15), { animate: false });
              fitted = true;
            } else if (waypoints.length === 1) {
              map.setView([waypoints[0].lat, waypoints[0].lon], 16, { animate: false });
              fitted = true;
            }

            if (fitted) {
              if (viajeId) {
                lastFittedViajeId.current = viajeId;
              } else {
                lastFittedWaypointsKey.current = waypointsKey;
              }
            }
          }
        }
      } catch (error) {
        console.error("Leaflet map update skipped:", error);
      }
    });
  }, [leaflet, waypoints, previewRoute, previewStatus, routePreviewApiUrl, incidentMarkers, telemetryPoints, viajeId]);

  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout | undefined;

    if (!routePreviewApiUrl || waypoints.length < 2) {
      timer = setTimeout(() => {
        setPreviewRoute(null);
        setPreviewStatus("idle");
      }, 0);
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    }

    timer = setTimeout(() => {
      setPreviewStatus("loading");
    }, 0);

    const controller = new AbortController();

    const loadPreviewRoute = async () => {
      try {
        const response = await fetch(`${routePreviewApiUrl}/viaje/ruta-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waypoints }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("preview route request failed");
        }

        const data = (await response.json()) as {
          geometry?: Array<[number, number]>;
          osrm_usado?: boolean;
        };

        if (!active) {
          return;
        }

        const nextRoute = Array.isArray(data.geometry)
          ? data.geometry.map(([lon, lat]) => ({ lat, lon }))
          : null;

        setPreviewRoute(nextRoute);
        setPreviewStatus(data.osrm_usado ? "osrm" : "fallback");
      } catch {
        if (active) {
          setPreviewRoute(null);
          setPreviewStatus("fallback");
        }
      }
    };

    void loadPreviewRoute();

    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [routePreviewApiUrl, waypoints]);

  const statusLabel =
    previewStatus === "osrm"
      ? "Ruta OSRM"
      : previewStatus === "loading"
        ? "Cargando OSRM"
        : previewStatus === "fallback"
          ? "OSRM no disponible"
          : "Sin ruta";

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300 shadow-lg shadow-black/20">
        {statusLabel}
      </div>
    </div>
  );
}
