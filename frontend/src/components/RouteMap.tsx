"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

type Waypoint = { lat: number; lon: number };

type RouteMapProps = {
  waypoints: Waypoint[];
  onAddWaypoint: (point: Waypoint) => void;
  center?: [number, number];
  zoom?: number;
};

export default function RouteMap({
  waypoints,
  onAddWaypoint,
  center = [13.6929, -89.2182],
  zoom = 12,
}: RouteMapProps) {
  const [leaflet, setLeaflet] = useState<null | typeof import("leaflet")>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const addRef = useRef(onAddWaypoint);
  const iconRef = useRef<import("leaflet").Icon | null>(null);

  useEffect(() => {
    addRef.current = onAddWaypoint;
  }, [onAddWaypoint]);

  useEffect(() => {
    let active = true;
    if (typeof window === "undefined") {
      return undefined;
    }

    import("leaflet").then((mod) => {
      if (!active) return;
      setLeaflet(mod);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !containerRef.current || mapRef.current) {
      return;
    }

    if (!iconRef.current) {
      iconRef.current = new leaflet.Icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });
    }

    const map = leaflet.map(containerRef.current).setView(center, zoom);
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
      })
      .addTo(map);

    const layerGroup = leaflet.layerGroup().addTo(map);

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

    waypoints.forEach((point) => {
      if (!iconRef.current) {
        return;
      }
      leaflet
        .marker([point.lat, point.lon], { icon: iconRef.current })
        .addTo(layerRef.current!);
    });

    if (waypoints.length > 1) {
      leaflet
        .polyline(
          waypoints.map((point) => [point.lat, point.lon]),
          { color: "#38bdf8" },
        )
        .addTo(layerRef.current);
    }
  }, [leaflet, waypoints]);

  return <div ref={containerRef} className="h-full w-full" />;
}
