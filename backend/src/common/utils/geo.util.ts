import { TELEMETRY_CONSTANTS } from '../constants/telemetry.constants';

export interface RouteWaypoint {
  lat: number;
  lon: number;
}

export class GeoUtils {
  static toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  static haversineKm(
    aLat: number,
    aLon: number,
    bLat: number,
    bLon: number,
  ): number {
    const R = TELEMETRY_CONSTANTS.EARTH_RADIUS_KM;
    const dLat = this.toRad(bLat - aLat);
    const dLon = this.toRad(bLon - aLon);
    const lat1 = this.toRad(aLat);
    const lat2 = this.toRad(bLat);

    const sinDlat = Math.sin(dLat / 2);
    const sinDlon = Math.sin(dLon / 2);
    const a =
      sinDlat * sinDlat + sinDlon * sinDlon * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static parseRouteWaypoints(data: unknown): RouteWaypoint[] {
    if (!data) return [];

    // Case 1: Simple Array [{ lat, lon }]
    if (Array.isArray(data)) {
      const arrayData = data as unknown[];
      return arrayData
        .map((p) => {
          if (p && typeof p === 'object') {
            const item = p as Record<string, unknown>;
            const lat = Number(item.lat ?? item.latitude);
            const lon = Number(item.lon ?? item.longitude);
            return { lat, lon };
          }
          return null;
        })
        .filter(
          (p): p is RouteWaypoint =>
            p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lon),
        );
    }

    // Case 2: GeoJSON FeatureCollection
    if (typeof data === 'object') {
      const geoData = data as Record<string, unknown>;
      const features = geoData.features;
      if (Array.isArray(features) && features.length > 0) {
        const firstFeature = features[0] as unknown;
        if (firstFeature && typeof firstFeature === 'object') {
          const featureObj = firstFeature as Record<string, unknown>;
          const geometry = featureObj.geometry;
          if (geometry && typeof geometry === 'object') {
            const geomObj = geometry as Record<string, unknown>;
            if (
              geomObj.type === 'LineString' &&
              Array.isArray(geomObj.coordinates)
            ) {
              const coords = geomObj.coordinates as unknown[];
              return coords
                .map((c) => {
                  if (Array.isArray(c) && c.length >= 2) {
                    return { lon: Number(c[0]), lat: Number(c[1]) };
                  }
                  return null;
                })
                .filter(
                  (p): p is RouteWaypoint =>
                    p !== null &&
                    Number.isFinite(p.lat) &&
                    Number.isFinite(p.lon),
                );
            }
          }
        }
      }
    }

    return [];
  }

  static downsample(
    waypoints: RouteWaypoint[],
    limit: number = TELEMETRY_CONSTANTS.DOWNSAMPLING_LIMIT,
  ): RouteWaypoint[] {
    if (waypoints.length <= limit) {
      return waypoints;
    }

    const step = (waypoints.length - 1) / (limit - 1);
    const downsampled: RouteWaypoint[] = [];
    for (let i = 0; i < limit; i++) {
      const index = Math.round(i * step);
      downsampled.push(waypoints[index]);
    }
    return downsampled;
  }

  static calculateMinDistance(
    point: { lat: number; lon: number },
    waypoints: RouteWaypoint[],
  ): number {
    if (waypoints.length === 0) {
      return Infinity;
    }
    if (waypoints.length === 1) {
      return this.haversineKm(
        point.lat,
        point.lon,
        waypoints[0].lat,
        waypoints[0].lon,
      );
    }

    let minKm = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];

      const dx = p2.lon - p1.lon;
      const dy = p2.lat - p1.lat;

      let t = 0;
      const denom = dx * dx + dy * dy;
      if (denom > 0) {
        t = ((point.lon - p1.lon) * dx + (point.lat - p1.lat) * dy) / denom;
        t = Math.max(0, Math.min(1, t));
      }

      const closestLat = p1.lat + t * dy;
      const closestLon = p1.lon + t * dx;

      const dist = this.haversineKm(
        point.lat,
        point.lon,
        closestLat,
        closestLon,
      );
      if (dist < minKm) {
        minKm = dist;
      }
    }
    return minKm;
  }
}
