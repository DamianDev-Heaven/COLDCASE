"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

type Waypoint = { lat: number; lon: number };

type RouteMapProps = {
  waypoints: Waypoint[];
  onAddWaypoint: (point: Waypoint) => void;
  center?: [number, number];
  zoom?: number;
  routePreviewApiUrl?: string;
};

type PreviewStatus = "idle" | "loading" | "osrm" | "fallback";

export default function RouteMap({
  waypoints,
  onAddWaypoint,
  center = [13.6929, -89.2182],
  zoom = 12,
  routePreviewApiUrl,
}: RouteMapProps) {
  const [leaflet, setLeaflet] = useState<null | typeof import("leaflet")>(null);
  const [previewRoute, setPreviewRoute] = useState<Waypoint[] | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const addRef = useRef(onAddWaypoint);
  const resizeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    addRef.current = onAddWaypoint;
  }, [onAddWaypoint]);

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

    const map = leaflet.map(containerRef.current).setView(center, zoom);
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
      addRef.current({ lat: event.latlng.lat, lon: event.latlng.lng });
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

      if (containerRef.current && "_leaflet_id" in containerRef.current) {
        (containerRef.current as unknown as { _leaflet_id?: number })._leaflet_id = undefined;
      }
    };
  }, [center, zoom, leaflet]);

  useEffect(() => {
    if (!layerRef.current || !leaflet) {
      return;
    }

    layerRef.current.clearLayers();

    const bounds = leaflet.latLngBounds([]);
    const routeToDraw = previewRoute ?? (routePreviewApiUrl ? null : waypoints);

    waypoints.forEach((point) => {
      const marker = leaflet
        .circleMarker([point.lat, point.lon], {
          radius: 7,
          color: "#67e8f9",
          weight: 3,
          fillColor: "#0f172a",
          fillOpacity: 1,
        })
        .addTo(layerRef.current!);
      bounds.extend(marker.getLatLng());
    });

    if (routeToDraw && routeToDraw.length > 1) {
      const routeLine = leaflet
        .polyline(
          routeToDraw.map((point) => [point.lat, point.lon]),
          {
            color: previewStatus === "osrm" ? "#22d3ee" : "#7dd3fc",
            weight: previewStatus === "osrm" ? 6 : 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          },
        )
        .addTo(layerRef.current);

      bounds.extend(routeLine.getBounds());
    }

    if (bounds.isValid()) {
      if (routeToDraw && routeToDraw.length > 1) {
        mapRef.current?.fitBounds(bounds, {
          padding: [36, 36],
          maxZoom: 16,
          animate: true,
        });
      } else if (waypoints.length === 1) {
        mapRef.current?.setView([waypoints[0].lat, waypoints[0].lon], 16, { animate: true });
      }
    }
  }, [leaflet, waypoints, previewRoute, previewStatus, routePreviewApiUrl]);

  useEffect(() => {
    let active = true;

    if (!routePreviewApiUrl || waypoints.length < 2) {
      setPreviewRoute(null);
      setPreviewStatus("idle");
      return undefined;
    }

    setPreviewStatus("loading");

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
        if (!active) {
          return;
        }

        setPreviewRoute(null);
        setPreviewStatus("fallback");
      }
    };

    loadPreviewRoute();

    return () => {
      active = false;
      controller.abort();
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
