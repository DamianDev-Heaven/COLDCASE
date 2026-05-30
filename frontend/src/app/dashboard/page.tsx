"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import RouteMap from "@/components/RouteMap";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import TelemetryChart from "@/components/TelemetryChart";
import ZepAuditModal from "@/components/ZepAuditModal";
import {
  Activity,
  History,
  LogOut,
  Search,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Plus,
  X,
  Truck,
  ChevronDown,
  Network,
  Users,
  Cpu,
  PanelLeft,
  PanelRight,
  Building,
  MapPin,
  Bot,
  Sparkles,
} from "lucide-react";

import { API_URL, SIMULATOR_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";

type Sucursal = {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  direccion?: string | null;
  lat: number;
  lon: number;
};

interface Viaje {
  id: string;
  estado: string;
  tipo_producto: string;
  valor_comercial: number;
  peso_kg: number;
  volumen_m3: number;
  limite_max_temp: number;
  limite_min_temp?: number;
  inicio_viaje?: string | null;
  final_viaje?: string | null;
  auditoria_ia?: string | null;
  transporte_id: string;
  transporte_placa: string;
  origen_id: string;
  origen_nombre: string;
  destino_id: string;
  destino_nombre: string;
  sucursal_origen_id?: string;
  sucursal_destino_id?: string;
  ruta_waypoints?: unknown;
  margen_desvio_km?: number;
}

interface Transporte {
  id: string;
  placa: string;
  capacidad_carga_kg: number;
  empresa_nombre: string;
  empresa_id: string;
  iot_id: string;
  estado: string;
}

interface PerfilProducto {
  id: string;
  nombre: string;
  limite_min_temp: number;
  limite_max_temp: number;
  limite_min_humedad?: number | null;
  limite_max_humedad?: number | null;
}

interface TelemetryPoint {
  id?: string | number;
  viaje_id: string;
  lat: number | string;
  lon: number | string;
  temp: number;
  humedad?: number | null;
  bateria?: number | null;
  timestamp_sensor: string;
  received_at?: string;
  ia_diagnosis?: string | null;
}

type SimulatorState = {
  iotFailure: boolean;
  paused: boolean;
  turboMode: boolean;
  lastError?: string | null;
  iotFailureSince?: string | null;
  lastSignalEvent?: {
    type: string;
    message?: string;
    viajeId?: string;
    bufferLength?: number;
    createdAt?: string;
  } | null;
  trip: {
    viajeId: string;
    compressorFailed: boolean;
    routeDeviated: boolean;
    gateOpenTicks: number;
    offlineBufferLength: number;
    status: string;
  } | null;
} | null;

interface UserSession {
  id: string;
  email: string;
  nombre?: string;
  rol?: "Admin" | "Operador" | "Auditor";
  role?: string;
}

export default function Dashboard() {
  const hasSelectedManually = useRef(false);
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [transportes, setTransportes] = useState<Transporte[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilProducto[]>([]);
  const isFirstLoad = useRef(true);
  const [viajeSeleccionado, setViajeSeleccionado] = useState<Viaje | null>(null);
  const [viajeFinalizadoDismissed, setViajeFinalizadoDismissed] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"overview" | "timeline">("overview");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isZepModalOpen, setIsZepModalOpen] = useState(false);
  const [telemetryList, setTelemetryList] = useState<TelemetryPoint[]>([]);
  const [simState, setSimState] = useState<SimulatorState>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const [contingencyStats, setContingencyStats] = useState<{
    dbStatus: string;
    size: number;
    backendStatus: "up" | "down";
  }>({
    dbStatus: "up",
    size: 0,
    backendStatus: "up",
  });

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await apiFetch(`${API_URL}/telemetria/contingency/stats`);
        if (res.ok) {
          const data = await res.json();
          setContingencyStats({
            dbStatus: data.dbStatus || "up",
            size: data.size || 0,
            backendStatus: "up",
          });
        } else {
          setContingencyStats((prev) => ({ ...prev, backendStatus: "down" }));
        }
      } catch {
        setContingencyStats({
          dbStatus: "down",
          size: 0,
          backendStatus: "down",
        });
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [currentView, setCurrentView] = useState<"overview" | "compliance" | "graph-explorer" | "admin">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const timers = [
      setTimeout(() => window.dispatchEvent(new Event("resize")), 50),
      setTimeout(() => window.dispatchEvent(new Event("resize")), 150),
      setTimeout(() => window.dispatchEvent(new Event("resize")), 300),
      setTimeout(() => window.dispatchEvent(new Event("resize")), 450),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isLeftCollapsed, isRightCollapsed, sidebarExpanded]);

  const [selectedEmpresa, setSelectedEmpresa] = useState("");
  const [transporteIdForm, setTransporteIdForm] = useState("");
  const [sucursalOrigenIdForm, setSucursalOrigenIdForm] = useState("");
  const [sucursalDestinoIdForm, setSucursalDestinoIdForm] = useState("");
  const [tipoProductoForm, setTipoProductoForm] = useState("");
  const [valorComercialForm, setValorComercialForm] = useState("");
  const [pesoKgForm, setPesoKgForm] = useState("");
  const [volumenM3Form, setVolumenM3Form] = useState("");
  const [limiteMaxTempForm, setLimiteMaxTempForm] = useState("5");
  const [limiteMinTempForm, setLimiteMinTempForm] = useState("1");
  const [limiteMinHumForm, setLimiteMinHumForm] = useState("0");
  const [limiteMaxHumForm, setLimiteMaxHumForm] = useState("100");
  const [perfilProductoIdForm, setPerfilProductoIdForm] = useState("");
  const [estadoForm, setEstadoForm] = useState<"pendiente" | "en_curso">("pendiente");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleDropOpen, setVehicleDropOpen] = useState(false);
  const vehicleDropRef = useRef<HTMLDivElement>(null);
  const [mapMounted, setMapMounted] = useState(false);

  const handleToggleVehicleDrop = () => {
    if (vehicleDropOpen) {
      setVehicleDropOpen(false);
      return;
    }

    setVehicleSearch("");
    setVehicleDropOpen(true);
  };

  const resetModalForm = () => {
    setSelectedEmpresa("");
    setTransporteIdForm("");
    setSucursalOrigenIdForm("");
    setSucursalDestinoIdForm("");
    setTipoProductoForm("");
    setValorComercialForm("");
    setPesoKgForm("");
    setVolumenM3Form("");
    setLimiteMaxTempForm("5");
    setLimiteMinTempForm("1");
    setLimiteMinHumForm("0");
    setLimiteMaxHumForm("100");
    setPerfilProductoIdForm("");
    setEstadoForm("pendiente");
    setSubmitError(null);
    setVehicleSearch("");
    setVehicleDropOpen(false);
    setMapMounted(false);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      const stored = localStorage.getItem("currentUser");
      const timer = setTimeout(() => {
        if (token) {
          setAccessToken(token);
        }
        if (stored) {
          try {
            setCurrentUser(JSON.parse(stored));
          } catch (e) {
            console.error("Error cargando sesión:", e);
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  // Click outside to close vehicle drop
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (vehicleDropRef.current && !vehicleDropRef.current.contains(event.target as Node)) {
        setVehicleDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("currentUser");
    window.location.href = "/login";
  };

  const sessionUserName = useMemo(() => {
    if (currentUser?.nombre) return currentUser.nombre;
    if (currentUser?.email) return currentUser.email.split("@")[0];
    return "Usuario";
  }, [currentUser]);

  const sessionUserRole = useMemo(() => {
    return currentUser?.rol || currentUser?.role || "Compliance Manager";
  }, [currentUser]);

  const isAdmin = useMemo(() => {
    const role = currentUser?.rol || currentUser?.role;
    return role === "Admin";
  }, [currentUser]);

  const sessionUserInitials = useMemo(() => {
    const parts = sessionUserName.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return sessionUserName.substring(0, 2).toUpperCase();
  }, [sessionUserName]);

  const waypointsViajeActivo = useMemo(() => {
    if (!viajeSeleccionado || sucursales.length === 0) return [];
    const origen = sucursales.find((s) => s.id === viajeSeleccionado.sucursal_origen_id);
    const destino = sucursales.find((s) => s.id === viajeSeleccionado.sucursal_destino_id);
    if (!origen || !destino) return [];
    return [
      { lat: Number(origen.lat), lon: Number(origen.lon) },
      { lat: Number(destino.lat), lon: Number(destino.lon) },
    ];
  }, [viajeSeleccionado, sucursales]);

  const waypointsFormModal = useMemo(() => {
    const orig = sucursales.find((s) => s.id === sucursalOrigenIdForm);
    const dest = sucursales.find((s) => s.id === sucursalDestinoIdForm);
    if (!orig || !dest) return [];
    return [
      { lat: Number(orig.lat), lon: Number(orig.lon) },
      { lat: Number(dest.lat), lon: Number(dest.lon) },
    ];
  }, [sucursales, sucursalOrigenIdForm, sucursalDestinoIdForm]);

  const viajesHistoricos = useMemo(() => {
    return viajes.filter((v) => {
      if (v.estado !== "finalizado") return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        v.id.toLowerCase().includes(query) ||
        (v.tipo_producto || "").toLowerCase().includes(query) ||
        (v.origen_nombre || "").toLowerCase().includes(query) ||
        (v.destino_nombre || "").toLowerCase().includes(query)
      );
    });
  }, [viajes, searchQuery]);

  const viajesActivos = useMemo(() => {
    return viajes.filter((v) => v.estado === "pendiente" || v.estado === "en_curso" || v.estado === "pausado");
  }, [viajes]);


  const handleExportCSV = (viaje: Viaje) => {
    if (!telemetryList || telemetryList.length === 0) {
      alert("No hay datos de telemetría disponibles para exportar.");
      return;
    }
    const headers = ["Timestamp", "Temperatura (C)", "Humedad (%)", "Bateria (%)", "Latitud", "Longitud", "Diagnostico IA"];
    const rows = telemetryList.map((t) => [
      t.timestamp_sensor,
      t.temp,
      t.humedad ?? "N/A",
      t.bateria ?? "N/A",
      t.lat,
      t.lon,
      t.ia_diagnosis ?? "Operacion Normal",
    ]);
    const csvString = [headers.join(","), ...rows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_compliance_${viaje.id.substring(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = (viaje: Viaje) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Habilita las ventanas emergentes para poder exportar el reporte.");
      return;
    }
    const temps = telemetryList.map((t) => t.temp);
    const maxTemp = temps.length > 0 ? Math.max(...temps) : viaje.limite_max_temp;
    const minTemp = temps.length > 0 ? Math.min(...temps) : (viaje.limite_min_temp ?? 0);
    const avgTemp = temps.length > 0 ? (temps.reduce((sum, val) => sum + val, 0) / temps.length).toFixed(1) : "N/A";
    const isCompliant = temps.every((t) => t <= viaje.limite_max_temp && t >= (viaje.limite_min_temp ?? 0));
    const statusLabel = isCompliant ? "✓ CADENA DE FRÍO: CERTIFICADA" : "⚠ DESVIACIÓN DE TEMPERATURA DETECTADA";
    const statusColor = isCompliant ? "#10b981" : "#ef4444";
    const statusBg = isCompliant ? "#ecfdf5" : "#fef2f2";
    const statusBorder = isCompliant ? "#a7f3d0" : "#fca5a5";

    const htmlContent = `
      <html>
        <head>
          <title>COLDCASE Compliance Certificate - #${viaje.id.substring(0, 8).toUpperCase()}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #0f172a; padding: 50px; line-height: 1.6; background: #fff; }
            .header-banner { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 32px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; box-shadow: 0 4px 6px -1px rgb(0 0 0/0.15); }
            .header-banner h1 { font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -0.025em; }
            .header-banner p { margin: 6px 0 0 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
            .status-badge { padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 12px; background-color: ${statusBg}; color: ${statusColor}; border: 1.5px solid ${statusBorder}; text-transform: uppercase; letter-spacing: 0.05em; }
            .section-title { font-size: 11px; font-weight: 700; color: #64748b; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px; margin-top: 36px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
            .info-block { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 10px; }
            .info-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 6px; letter-spacing: 0.06em; }
            .info-value { font-size: 14px; font-weight: 700; color: #1e293b; }
            .audit-card { background: #faf5ff; border: 1px solid #f3e8ff; border-left: 4px solid #a855f7; padding: 22px; border-radius: 10px; font-size: 13px; color: #475569; line-height: 1.75; }
            .table-container { margin-top: 22px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            table { width: 100%; border-collapse: collapse; text-align: left; font-size: 11px; }
            th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
            td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 70px; border-top: 1.5px solid #e2e8f0; padding-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
            .signature-box { width: 260px; border-top: 1px solid #94a3b8; text-align: center; padding-top: 12px; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <div>
              <h1>COLDCASE COMPLIANCE REPORT</h1>
              <p>Certificación Oficial · Historial Termocontrolado · SHA-256 Secured</p>
            </div>
            <div class="status-badge">${statusLabel}</div>
          </div>
          <div class="section-title">Información del Despacho</div>
          <div class="grid">
            <div class="info-block"><div class="info-label">ID de Operación</div><div class="info-value" style="font-family:monospace;font-size:11px">${viaje.id}</div></div>
            <div class="info-block"><div class="info-label">Categoría de Carga</div><div class="info-value">${viaje.tipo_producto}</div></div>
            <div class="info-block"><div class="info-label">Vehículo / Placa</div><div class="info-value" style="font-family:monospace">${viaje.transporte_placa || "N/A"}</div></div>
            <div class="info-block"><div class="info-label">Valor Asegurado</div><div class="info-value">$${Number(viaje.valor_comercial).toLocaleString()} USD</div></div>
            <div class="info-block"><div class="info-label">Punto de Origen</div><div class="info-value">${viaje.origen_nombre}</div></div>
            <div class="info-block"><div class="info-label">Punto de Destino</div><div class="info-value">${viaje.destino_nombre}</div></div>
          </div>
          <div class="section-title">Métricas de Temperatura — Cadena de Frío</div>
          <div class="grid">
            <div class="info-block"><div class="info-label">Umbral Permitido</div><div class="info-value">${viaje.limite_min_temp ?? 0}°C — ${viaje.limite_max_temp}°C</div></div>
            <div class="info-block"><div class="info-label">Temperatura Promedio</div><div class="info-value">${avgTemp}°C</div></div>
            <div class="info-block"><div class="info-label">Extremos Registrados</div><div class="info-value">↓${minTemp}°C / ↑${maxTemp}°C</div></div>
          </div>
          <div class="section-title">Análisis de Calidad IA (Veredicto Final)</div>
          <div class="audit-card">${viaje.auditoria_ia || "No se ha generado el veredicto definitivo de IA para este despacho."}</div>
          <div class="section-title">Registro de Telemetría</div>
          <div class="table-container">
            <table>
              <thead><tr><th>Timestamp</th><th>Temp (°C)</th><th>Humedad (%)</th><th>Batería (%)</th><th>Coordenadas</th><th>Diagnóstico IA</th></tr></thead>
              <tbody>
                ${telemetryList.slice(0, 15).map((t) => `
                  <tr>
                    <td style="font-family:monospace">${new Date(t.timestamp_sensor).toLocaleString()}</td>
                    <td style="font-weight:700;color:${t.temp > viaje.limite_max_temp || t.temp < (viaje.limite_min_temp ?? 0) ? "#ef4444" : "#1e293b"}">${t.temp}°C</td>
                    <td>${t.humedad ? t.humedad + "%" : "N/A"}</td>
                    <td>${t.bateria ? t.bateria + "%" : "N/A"}</td>
                    <td style="font-family:monospace">${Number(t.lat).toFixed(4)}, ${Number(t.lon).toFixed(4)}</td>
                    <td>${t.ia_diagnosis || "Normal"}</td>
                  </tr>
                `).join("")}
                ${telemetryList.length > 15 ? `<tr><td colspan="6" style="text-align:center;color:#64748b;font-style:italic">... ${telemetryList.length - 15} lecturas adicionales disponibles en CSV adjunto.</td></tr>` : ""}
              </tbody>
            </table>
          </div>
          <div class="footer">
            <div style="font-size:9px;color:#94a3b8;font-family:monospace;line-height:1.6">
              Generado por: ${sessionUserName} (${sessionUserRole})<br>
              Fecha de Reporte: ${new Date().toLocaleString()}<br>
              COLDCASE · Plataforma de Trazabilidad Termocontrolada
            </div>
            <div class="signature-box">
              Firma Responsable de Auditoría<br>
              <strong style="color:#0f172a;font-size:13px;display:block;margin-top:5px">${sessionUserName}</strong>
              <span style="font-size:10px;color:#64748b">${sessionUserRole}</span>
            </div>
          </div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 500); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePerfilChange = (perfilId: string) => {
    setPerfilProductoIdForm(perfilId);
    if (!perfilId) {
      return;
    }
    const selected = perfiles.find((p) => p.id === perfilId);
    if (selected) {
      setLimiteMinTempForm(String(selected.limite_min_temp));
      setLimiteMaxTempForm(String(selected.limite_max_temp));
      setLimiteMinHumForm(String(selected.limite_min_humedad));
      setLimiteMaxHumForm(String(selected.limite_max_humedad));
      setTipoProductoForm(selected.nombre);
    }
  };

  const handleCreateViaje = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    if (!transporteIdForm || !sucursalOrigenIdForm || !sucursalDestinoIdForm || !tipoProductoForm || !valorComercialForm) {
      setSubmitError("Completa todos los campos técnicos y comerciales obligatorios.");
      return;
    }
    const payload = {
      transporte_id: transporteIdForm,
      sucursal_origen_id: sucursalOrigenIdForm,
      sucursal_destino_id: sucursalDestinoIdForm,
      tipo_producto: tipoProductoForm,
      valor_comercial: Number(valorComercialForm),
      peso_kg: Number(pesoKgForm || 0),
      volumen_m3: Number(volumenM3Form || 0),
      limite_max_temp: Number(limiteMaxTempForm),
      limite_min_temp: Number(limiteMinTempForm),
      limite_min_humedad: Number(limiteMinHumForm),
      limite_max_humedad: Number(limiteMaxHumForm),
      perfil_producto_id: perfilProductoIdForm || undefined,
      estado: estadoForm,
      ruta_waypoints: {},
    };
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`${API_URL}/viaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.message || "Error en la respuesta del servidor NestJS";
        throw new Error(Array.isArray(errMsg) ? errMsg.join(", ") : String(errMsg));
      }
      const nuevoViaje = await response.json();
      setViajes((current) => [nuevoViaje, ...current]);
      hasSelectedManually.current = true;
      setViajeSeleccionado(nuevoViaje);
      setIsModalOpen(false);
      resetModalForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Error inesperado al mapear el envío");
    } finally {
      setIsSubmitting(false);
    }
  };

  async function handleIniciarViaje(viajeId: string) {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_URL}/viaje/${viajeId}/iniciar`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string })?.message || `Error ${res.status}`);
      }
      const actualizado = await res.json();
      setViajes((cur) => cur.map((v) => (v.id === actualizado.id ? actualizado : v)));
      hasSelectedManually.current = true;
      setViajeSeleccionado(actualizado);
    } catch (error) {
      console.error("Error iniciando viaje:", error);
      alert(error instanceof Error ? error.message : "No se pudo iniciar el viaje.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePausarViaje(viajeId: string) {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_URL}/viaje/${viajeId}/pausar`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string })?.message || `Error ${res.status}`);
      }
      const actualizado = await res.json();
      setViajes((cur) => cur.map((v) => (v.id === actualizado.id ? actualizado : v)));
      hasSelectedManually.current = true;
      setViajeSeleccionado(actualizado);
    } catch (error) {
      console.error("Error al pausar viaje:", error);
      alert(error instanceof Error ? error.message : "No se pudo pausar el viaje.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReanudarViaje(viajeId: string) {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_URL}/viaje/${viajeId}/reanudar`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string })?.message || `Error ${res.status}`);
      }
      const actualizado = await res.json();
      setViajes((cur) => cur.map((v) => (v.id === actualizado.id ? actualizado : v)));
      hasSelectedManually.current = true;
      setViajeSeleccionado(actualizado);
    } catch (error) {
      console.error("Error al reanudar viaje:", error);
      alert(error instanceof Error ? error.message : "No se pudo reanudar el viaje.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelarViaje(viajeId: string) {
    if (!confirm("¿Está seguro de que desea cancelar este viaje? Se cerrarán todos los incidentes activos.")) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_URL}/viaje/${viajeId}/cancelar`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string })?.message || `Error ${res.status}`);
      }
      const actualizado = await res.json();
      setViajes((cur) => cur.map((v) => (v.id === actualizado.id ? actualizado : v)));
      hasSelectedManually.current = true;
      setViajeSeleccionado(actualizado);
    } catch (error) {
      console.error("Error al cancelar viaje:", error);
      alert(error instanceof Error ? error.message : "No se pudo cancelar el viaje.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    async function cargarViajes() {
      try {
        const [viajesRes, transportesRes, sucursalesRes, perfilesRes] = await Promise.all([
          apiFetch(`${API_URL}/viaje`),
          apiFetch(`${API_URL}/transporte`),
          apiFetch(`${API_URL}/sucursal`),
          apiFetch(`${API_URL}/viaje/recetas/perfiles`),
        ]);
        const data = await viajesRes.json();
        const transportesData = await transportesRes.json();
        const sucursalesData = await sucursalesRes.json();
        const perfilesData = await perfilesRes.json();
        setViajes(data);
        if (isFirstLoad.current && Array.isArray(data)) {
          const alreadyFinished = data.filter((v: Viaje) => v.estado === "finalizado").map((v: Viaje) => v.id);
          setViajeFinalizadoDismissed(alreadyFinished);
          isFirstLoad.current = false;
        }
        setTransportes(transportesData);
        setSucursales(Array.isArray(sucursalesData) ? sucursalesData : []);
        setPerfiles(Array.isArray(perfilesData) ? perfilesData : []);
        if (data.length > 0) {
          const activePreferred = data.find((v: Viaje) =>
            v.estado === "en_curso" || v.estado === "pendiente" || v.estado === "pausado",
          );

          setViajeSeleccionado((current) => {
            if (current) {
              const updated = data.find((v: Viaje) => v.id === current.id);
              return updated || current;
            }
            return hasSelectedManually.current ? current : (activePreferred || null);
          });
        }
      } catch (error) {
        console.error("Error cargando variables reales:", error);
      } finally {
        setIsLoading(false);
      }
    }
    cargarViajes();
    const interval = setInterval(cargarViajes, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!viajeSeleccionado?.id) {
      const timer = setTimeout(() => { setTelemetryList([]); }, 0);
      return () => clearTimeout(timer);
    }
    const timerLoading = setTimeout(() => { setIsTelemetryLoading(true); }, 0);
    const viajeId = viajeSeleccionado.id;
    async function cargarTelemetria() {
      try {
        const res = await apiFetch(`${API_URL}/telemetria/viaje/${viajeId}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data)
            ? (data as TelemetryPoint[]).sort((a, b) =>
                new Date(a.timestamp_sensor).getTime() - new Date(b.timestamp_sensor).getTime()
              )
            : [];
          setTelemetryList(sorted);
        }
      } catch (error) {
        console.error("Error cargando telemetria del viaje:", error);
      } finally {
        setIsTelemetryLoading(false);
      }
    }
    cargarTelemetria();
    const interval = setInterval(cargarTelemetria, 5000);
    return () => { clearTimeout(timerLoading); clearInterval(interval); };
  }, [viajeSeleccionado?.id]);

  useEffect(() => {
    if (!viajeSeleccionado?.id) {
      const timer = setTimeout(() => setSimState(null), 0);
      return () => clearTimeout(timer);
    }

    const viajeId = viajeSeleccionado.id;

    async function cargarSimulador() {
      try {
        const res = await apiFetch(`${API_URL}/viaje/${viajeId}/simulador-estado`);
        if (res.ok) {
          setSimState(await res.json());
        }
      } catch (error) {
        console.error("Error cargando estado del simulador:", error);
      }
    }

    cargarSimulador();
    const interval = setInterval(cargarSimulador, 4000);
    return () => clearInterval(interval);
  }, [viajeSeleccionado?.id]);

  // ─── LOADING SKELETON ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-screen w-full bg-[#02040a] flex flex-col p-5 gap-4">
        <div className="h-14 w-full bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
        <div className="flex-1 flex gap-4">
          <div className="w-16 bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
          <div className="w-[300px] bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
            <div className="h-[260px] bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
          </div>
          <div className="w-[320px] bg-slate-900/50 border border-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-black text-slate-100 h-screen w-full overflow-hidden flex flex-col font-sans antialiased">

      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <header
        className={`bg-black border-b border-white/[0.08] fixed top-0 right-0 z-20 flex justify-between items-center px-5 h-14 transition-[left] duration-300 ease-in-out ${
          sidebarExpanded ? "left-[240px]" : "left-[64px]"
        }`}
      >
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-[11px] font-bold text-white uppercase tracking-[0.12em]">
              {currentView === "overview" ? "Monitoreo Activo en Tiempo Real" : "Historial · Compliance · Auditoría"}
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <StatusPill label="Backend" status={contingencyStats.backendStatus} />
            <StatusPill label="Base de Datos" status={contingencyStats.size > 0 ? "degraded" : (contingencyStats.dbStatus === "up" ? "up" : "down")} />
            {contingencyStats.size > 0 && (
              <div className="flex items-center gap-2 bg-black/80 border border-white/10 px-3 py-1 rounded-lg text-white/70 text-[10px] font-mono">
                <span>⚠️ {contingencyStats.size} en cola Redis</span>
                {contingencyStats.dbStatus === "up" && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await apiFetch(`${API_URL}/telemetria/contingency/retry`, { method: "POST" });
                        const res = await apiFetch(`${API_URL}/telemetria/contingency/stats`);
                        if (res.ok) {
                          const data = await res.json();
                          setContingencyStats({
                            dbStatus: data.dbStatus || "up",
                            size: data.size || 0,
                            backendStatus: "up",
                          });
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="bg-black border border-white/10 text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-colors cursor-pointer ml-1"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => { resetModalForm(); setIsModalOpen(true); setMapMounted(true); }}
            className="group bg-black hover:bg-white/6 border border-white/16 hover:border-white/28 text-white px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2 transition-all duration-300 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
            Nuevo Envío
          </button>
          <a
            href={accessToken ? `${SIMULATOR_URL}?token=${accessToken}` : SIMULATOR_URL}
            target="_blank"
            rel="noreferrer"
            className="bg-black hover:bg-white/6 border border-white/[0.14] hover:border-white/28 px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2 transition-all duration-300"
          >
            <Truck className="w-3.5 h-3.5 opacity-60" />
            Simulador
          </a>
          <div className="flex items-center gap-1 bg-black border border-white/10 p-1 rounded-xl">
            <button
              onClick={() => setIsLeftCollapsed((c) => !c)}
              className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                !isLeftCollapsed ? "text-white bg-white/6" : "text-slate-500 hover:text-slate-300"
              }`}
              title={isLeftCollapsed ? "Mostrar lista de viajes" : "Ocultar lista de viajes"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsRightCollapsed((c) => !c)}
              className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                !isRightCollapsed ? "text-white bg-white/6" : "text-slate-500 hover:text-slate-300"
              }`}
              title={isRightCollapsed ? "Mostrar panel de IA" : "Ocultar panel de IA"}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── WORKSPACE ──────────────────────────────────────────────────────── */}
      <div className="flex h-[calc(100vh-3.5rem)] mt-14 overflow-hidden w-full">

        {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
        <nav
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
          className={`bg-black border-r border-white/[0.08] fixed left-0 top-0 h-full z-30 flex flex-col pt-14 pb-4 transition-[width,padding] duration-300 ease-in-out ${
            sidebarExpanded ? "w-[240px] px-3" : "w-[64px] px-2.5 items-center"
          }`}
        >
          {/* Logo area */}
          <div className={`flex items-center gap-3 py-4 border-b border-white/[0.08] mb-4 w-full ${sidebarExpanded ? "px-1" : "justify-center"}`}>
            <div className="w-9 h-9 bg-black border border-white/12 rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-white" />
            </div>
            {sidebarExpanded && (
              <div className="overflow-hidden">
                <span className="text-[13px] font-extrabold tracking-widest text-white whitespace-nowrap">
                  COLD<span className="text-white/70">CASE</span>
                </span>
                <p className="text-[8px] text-slate-500 tracking-[0.12em] uppercase mt-0.5 whitespace-nowrap">Cold Chain Monitor</p>
              </div>
            )}
          </div>

          {/* Navigation links */}
          <div className="flex flex-col gap-1.5 w-full flex-1">
            {sidebarExpanded && (
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.15em] px-1 mb-1">Monitoreo</p>
            )}
            <NavItem icon={Activity} label="Monitoreo Activo" view="overview" currentView={currentView} sidebarExpanded={sidebarExpanded} onNavigate={setCurrentView} />
            <NavItem icon={History} label="Historial y Compliance" view="compliance" currentView={currentView} sidebarExpanded={sidebarExpanded} onNavigate={setCurrentView} />
            <NavItem icon={Network} label="Explorador de Grafo" view="graph-explorer" currentView={currentView} sidebarExpanded={sidebarExpanded} onNavigate={setCurrentView} />

            {sidebarExpanded && (
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.15em] px-1 mt-4 mb-1">Herramientas</p>
            )}
            <NavItem icon={Truck} label="Consola del Simulador" href={accessToken ? `${SIMULATOR_URL}?token=${accessToken}` : SIMULATOR_URL} sidebarExpanded={sidebarExpanded} />
            <NavItem icon={Cpu} label="Control y Sandbox (IA)" href="/ia" sidebarExpanded={sidebarExpanded} />

            {isAdmin && (
              <>
                {sidebarExpanded && (
                  <p className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.15em] px-1 mt-4 mb-1">Administración</p>
                )}
                <NavItem icon={Building} label="Administrar Entidades" view="admin" currentView={currentView} sidebarExpanded={sidebarExpanded} onNavigate={setCurrentView} />
                <NavItem icon={Users} label="Gestión de Usuarios" href="/register" sidebarExpanded={sidebarExpanded} />
              </>
            )}
          </div>

          {/* Session profile */}
          <div className="w-full mt-auto border-t border-white/[0.08] pt-3">
            {sidebarExpanded ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black border border-white/[0.08] w-full">
                <div className="w-9 h-9 rounded-xl bg-black border border-white/12 flex items-center justify-center font-bold text-white text-[11px] shrink-0">
                  {sessionUserInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white truncate leading-tight">{sessionUserName}</p>
                  <p className="text-[9px] text-slate-500 truncate mt-0.5 font-mono">{sessionUserRole}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="text-slate-600 hover:text-white/70 transition-colors shrink-0 cursor-pointer p-1 rounded-lg hover:bg-white/6"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="group relative flex justify-center w-full">
                <div
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="w-9 h-9 rounded-xl bg-black border border-white/[0.12] flex items-center justify-center font-bold text-white text-[11px] cursor-pointer hover:border-white/20 hover:text-white/70 hover:bg-white/6 transition-all duration-200"
                >
                  {sessionUserInitials}
                </div>
                <div className="pointer-events-none absolute left-[52px] bottom-0 rounded-lg bg-black border border-white/10 px-3 py-2 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 z-[100] whitespace-nowrap shadow-2xl shadow-black/40">
                  <p className="text-[10px] font-bold text-white">{sessionUserName}</p>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">{sessionUserRole}</p>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ── CONTENT AREA ─────────────────────────────────────────────────── */}
        {currentView === "overview" ? (
          <main className={`flex-1 flex p-3 gap-3 overflow-hidden h-full transition-[margin-left] duration-300 ease-in-out ${sidebarExpanded ? "ml-[240px]" : "ml-[64px]"}`}>

            {/* Lista lateral activos */}
            <aside className={`h-full flex flex-col bg-black border border-white/[0.08] rounded-2xl overflow-hidden shrink-0 transition-all duration-300 ${
              isLeftCollapsed ? "w-0 opacity-0 pointer-events-none border-none p-0 m-0" : "w-[290px]"
            }`}>
              <div className="p-4 border-b border-white/[0.08]">
                <div className="flex justify-between items-center">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Activos</h2>
                  <span className="text-white bg-white/6 px-2 py-0.5 rounded-full border border-white/10 text-[10px] font-bold">{viajesActivos.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 no-scrollbar">
                {viajesActivos.map((viaje) => (
                  <ViajeCard
                    key={viaje.id}
                    viaje={viaje}
                    isSelected={viajeSeleccionado?.id === viaje.id}
                    isSubmitting={isSubmitting}
                    onSelect={(v) => { hasSelectedManually.current = true; setViajeSeleccionado(v); }}
                    onIniciar={handleIniciarViaje}
                    onPausar={handlePausarViaje}
                    onReanudar={handleReanudarViaje}
                    onCancelar={handleCancelarViaje}
                  />
                ))}
                {viajesActivos.length === 0 && (
                  <div className="text-center p-8 text-slate-600 text-[11px] font-mono leading-relaxed">
                    Sin envíos activos.<br />Registra uno con el botón superior.
                  </div>
                )}
              </div>
            </aside>

            {/* Centro: mapa + tabs */}
            <div className="flex-1 flex flex-col gap-3 h-full min-w-0">
              {viajeSeleccionado && (
                <div className="rounded-2xl border border-white/[0.08] bg-black/80 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Estado del simulador</p>
                    <p className="mt-1 text-xs text-slate-300 truncate">
                      {simState?.iotFailure
                        ? "Pérdida de señal IoT activa"
                        : "Señal IoT normal"}
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${simState?.iotFailure ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
                    {simState?.iotFailure ? "Sin señal" : "En línea"}
                  </div>
                  <div className="rounded-full border border-white/10 bg-black px-3 py-1 text-[10px] font-mono text-slate-400">
                    Buffer: {simState?.trip?.offlineBufferLength ?? 0}
                  </div>
                </div>
              )}
              {simState?.iotFailure && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300">Diagnóstico interno</p>
                    <p className="mt-1 truncate">
                      {simState.lastSignalEvent?.message || simState.lastError || "Pérdida de señal IoT activa"}
                    </p>
                  </div>
                  <div className="font-mono text-[10px] text-rose-200/80">
                    {simState.iotFailureSince ? new Date(simState.iotFailureSince).toLocaleTimeString() : "-"}
                  </div>
                </div>
              )}
              <div className="flex-1 bg-black border border-white/[0.08] rounded-2xl relative overflow-hidden z-10 transition-colors duration-500">
                {viajeSeleccionado ? (
                  <>
                    {waypointsViajeActivo.length === 2 ? (
                      <RouteMap viajeId={viajeSeleccionado.id} waypoints={waypointsViajeActivo} telemetryPoints={telemetryList} routePreviewApiUrl={API_URL} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-650 gap-3">
                        <div className="w-10 h-10 border-2 border-slate-700 border-t-white/20 rounded-full animate-spin" />
                        <p className="text-xs font-mono">Geolocalizando trayecto OSRM...</p>
                      </div>
                    )}
                    
                     {viajeSeleccionado.estado === "finalizado" && !viajeFinalizadoDismissed.includes(viajeSeleccionado.id) && (
                       <div className="absolute inset-0 z-[1001] flex flex-col items-center justify-center p-6 bg-black/90 text-center">
                         <div className="max-w-md w-full bg-black border border-white/10 p-8 rounded-3xl flex flex-col items-center gap-5 relative overflow-hidden">
                           {/* Decorative gradient overlay */}
                           <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/6 rounded-full" />
                           <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-white/4 rounded-full" />
                           
                           {/* Close Button */}
                           <button
                             onClick={() => setViajeFinalizadoDismissed((prev) => prev.includes(viajeSeleccionado.id) ? prev : [...prev, viajeSeleccionado.id])}
                             className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer z-10"
                           >
                             <X className="w-5 h-5" />
                           </button>

                           <div className="w-16 h-16 rounded-full bg-black border border-white/12 flex items-center justify-center animate-bounce">
                             <ShieldCheck className="w-9 h-9 text-white" />
                           </div>
                           
                           <div>
                             <h3 className="text-lg font-bold text-white uppercase tracking-wider">¡Destino Alcanzado!</h3>
                             <p className="text-xs text-slate-400 mt-1">
                               El viaje de {viajeSeleccionado.tipo_producto || "Carga Sensible"} ha concluido exitosamente.
                             </p>
                           </div>

                           <div className="w-full bg-[#050505] rounded-2xl p-4 border border-white/8 space-y-3">
                             <div className="flex justify-between items-center text-xs font-mono">
                               <span className="text-slate-500">Cadena de Frío:</span>
                               {telemetryList.some((p) => p.temp > (viajeSeleccionado.limite_max_temp || 5) || p.temp < (viajeSeleccionado.limite_min_temp || 1)) ? (
                                 <span className="px-2 py-0.5 rounded bg-black border border-white/10 text-white font-bold text-[10px]">
                                   DESVIADA
                                 </span>
                               ) : (
                                 <span className="px-2 py-0.5 rounded bg-black border border-white/10 text-white font-bold text-[10px]">
                                   CERTIFICADA
                                 </span>
                               )}
                             </div>

                             <div className="h-px bg-white/6" />

                             <div className="text-left">
                               <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                 <Cpu className="w-3.5 h-3.5 text-white/70" />
                                 Auditoría de Calidad IA
                               </div>
                               {viajeSeleccionado.auditoria_ia ? (
                                 <p className="text-[11px] text-slate-300 leading-relaxed font-sans line-clamp-4">
                                   {viajeSeleccionado.auditoria_ia}
                                 </p>
                               ) : (
                                 <div className="flex items-center gap-2 py-1 text-slate-500 text-[11px]">
                                   <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-white/20 rounded-full animate-spin" />
                                   <span>Compilando veredicto y cargando certificado...</span>
                                 </div>
                               )}
                             </div>
                           </div>

                           <div className="grid grid-cols-2 gap-2.5 w-full">
                             <button
                               onClick={() => handleExportPDF(viajeSeleccionado)}
                               className="flex items-center justify-center gap-2 py-2 px-3 bg-black hover:bg-white/6 text-white border border-white/14 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                             >
                               <FileText className="w-4 h-4" />
                               Certificado PDF
                             </button>
                             <button
                               onClick={() => handleExportCSV(viajeSeleccionado)}
                               className="flex items-center justify-center gap-2 py-2 px-3 bg-black hover:bg-white/6 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                             >
                               <FileSpreadsheet className="w-4 h-4" />
                               Datos CSV
                             </button>
                             <button
                               onClick={() => setCurrentView("compliance")}
                               className="flex items-center justify-center gap-2 py-2 px-3 bg-black hover:bg-white/6 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                             >
                               <History className="w-4 h-4" />
                               Ver Historial
                             </button>
                             <button
                               onClick={() => { resetModalForm(); setIsModalOpen(true); }}
                               className="flex items-center justify-center gap-2 py-2 px-3 bg-black hover:bg-white/6 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                             >
                               <Plus className="w-4 h-4" />
                               Nuevo Envío
                             </button>
                           </div>

                           <button
                             onClick={() => setViajeFinalizadoDismissed((prev) => prev.includes(viajeSeleccionado.id) ? prev : [...prev, viajeSeleccionado.id])}
                             className="w-full py-2 bg-black hover:bg-white/6 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2"
                           >
                             Cerrar Ventana
                           </button>
                         </div>
                       </div>
                     )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-4 p-8 bg-black">
                    <Truck className="w-12 h-12 text-white/40 animate-pulse" />
                    <div className="text-center">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Monitoreo de Envíos</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        No hay ningún viaje activo o seleccionado. Registra un despacho para iniciar el monitoreo térmico en tiempo real.
                      </p>
                    </div>
                    <button
                      onClick={() => { resetModalForm(); setIsModalOpen(true); }}
                      className="flex items-center gap-2 py-2 px-4 bg-black border border-white/10 hover:bg-white/6 text-white rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Iniciar Nuevo Envío
                    </button>
                  </div>
                )}
              </div>

              <div className="h-[280px] shrink-0 bg-black border border-white/[0.08] rounded-2xl flex flex-col overflow-hidden transition-colors duration-500">
                {viajeSeleccionado ? (
                  <>
                    <div className="flex border-b border-white/[0.08] px-4 bg-transparent shrink-0">
                      <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all duration-300 cursor-pointer ${activeTab === "overview" ? "border-white text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}
                      >
                        Historial Térmico
                      </button>
                      <button
                        onClick={() => setActiveTab("timeline")}
                        className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all duration-300 cursor-pointer ${activeTab === "timeline" ? "border-white text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}
                      >
                        Ficha de Despacho
                      </button>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto no-scrollbar">
                      {activeTab === "overview" && (
                        <div className="flex gap-4 h-full items-stretch">
                          <div className="w-[120px] shrink-0 bg-black border border-white/[0.08] p-3 rounded-xl flex flex-col justify-center gap-2">
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Rango °C</span>
                            <div className="text-[11px] font-mono text-white/70 font-bold">↑ {viajeSeleccionado.limite_max_temp || 5}°C</div>
                            <div className="text-[11px] font-mono text-sky-400 font-bold">↓ {viajeSeleccionado.limite_min_temp || 1}°C</div>
                            <div className="h-px bg-white/5 my-1" />
                            <span className="text-[8px] font-mono text-slate-650">{viajeSeleccionado.peso_kg || 0} Kg</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <TelemetryChart
                              telemetryData={telemetryList}
                              limiteMin={Number(viajeSeleccionado.limite_min_temp || 1)}
                              limiteMax={Number(viajeSeleccionado.limite_max_temp || 5)}
                              isLoading={isTelemetryLoading}
                            />
                          </div>
                        </div>
                      )}
                      {activeTab === "timeline" && (
                        <div className="flex flex-col gap-3 h-full justify-center">
                          <div className="grid grid-cols-3 gap-3">
                            <StatCard label="Valor Asegurado" value={`$${Number(viajeSeleccionado.valor_comercial || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
                            <StatCard
                              label="Estado de Riesgo"
                              value={
                                viajeSeleccionado.id === "77777777-7777-4777-8777-777777777777" ||
                                telemetryList.some((p) => p.temp > (viajeSeleccionado.limite_max_temp || 5) || p.temp < (viajeSeleccionado.limite_min_temp || 1))
                                  ? "CRÍTICO"
                                  : "ESTABLE"
                              }
                              valueClass={
                                telemetryList.some((p) => p.temp > (viajeSeleccionado.limite_max_temp || 5) || p.temp < (viajeSeleccionado.limite_min_temp || 1))
                                  ? "text-rose-400"
                                  : "text-white/70"
                              }
                            />
                            <StatCard label="Ocupación" value={`${((Number(viajeSeleccionado.peso_kg || 0) / 15000) * 100).toFixed(1)}%`} valueClass="text-white/70" />
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px] font-mono border-t border-white/[0.05] pt-3">
                            <KV label="Categoría" value={viajeSeleccionado.tipo_producto || "N/A"} />
                            <KV label="Volumen" value={`${viajeSeleccionado.volumen_m3 || 0} m³`} />
                            <KV label="Desvío Máx" value={`${viajeSeleccionado.margen_desvio_km || "N/A"} Km`} />
                            <KV label="Destino ID" value={viajeSeleccionado.sucursal_destino_id?.substring(0, 12) + "..." || "N/A"} />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500/80 text-xs font-mono">
                    Selecciona o inicia un viaje para ver métricas.
                  </div>
                )}
              </div>
            </div>

            {/* Columna derecha: IA */}
            <aside className={`h-full shrink-0 transition-all duration-300 ${
              isRightCollapsed ? "w-0 opacity-0 pointer-events-none border-none p-0 m-0" : "w-[330px]"
            }`}>
              <AiInsightsPanel
                viaje={viajeSeleccionado}
                telemetryList={telemetryList}
                apiUrl={API_URL}
                simulatorState={simState}
                onOpenZepModal={() => setIsZepModalOpen(true)}
              />
            </aside>
          </main>

        ) : currentView === "compliance" ? (
          /* ── COMPLIANCE VIEW ─────────────────────────────────────────────── */
          <main className={`flex-1 flex p-3 gap-3 overflow-hidden h-full transition-[margin-left] duration-300 ease-in-out ${sidebarExpanded ? "ml-[240px]" : "ml-[64px]"}`}>

            {/* Lista lateral histórica */}
            <aside className={`h-full flex flex-col bg-black border border-white/[0.08] rounded-2xl overflow-hidden shrink-0 transition-all duration-300 ${
              isLeftCollapsed ? "w-0 opacity-0 pointer-events-none border-none p-0 m-0" : "w-[290px]"
            }`}>
              <div className="p-4 border-b border-white/[0.08]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Auditorías</h2>
                  <span className="text-white bg-white/6 px-2 py-0.5 rounded-full border border-white/10 text-[10px] font-bold">{viajesHistoricos.length}</span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="text"
                    placeholder="Buscar despacho..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black border border-white/[0.10] rounded-xl pl-8 pr-3 py-2 text-[11px] text-white placeholder-slate-600 outline-none focus:border-white/28 transition-all font-mono"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 no-scrollbar">
                {viajesHistoricos.map((viaje) => (
                  <ViajeCard key={viaje.id} viaje={viaje} isHistorico isSelected={viajeSeleccionado?.id === viaje.id} isSubmitting={isSubmitting} onSelect={(v) => { hasSelectedManually.current = true; setViajeSeleccionado(v); }} onIniciar={handleIniciarViaje} />
                ))}
                {viajesHistoricos.length === 0 && (
                  <div className="text-center p-8 text-slate-600 text-[11px] font-mono leading-relaxed">
                    Sin auditorías registradas.
                  </div>
                )}
              </div>
            </aside>

            {/* Centro: mapa + gráfico compliance */}
            <div className="flex-1 flex flex-col gap-3 h-full min-w-0">
              <div className="flex-1 bg-black border border-white/[0.08] rounded-2xl relative overflow-hidden z-10 transition-colors duration-500">
                {viajeSeleccionado && waypointsViajeActivo.length === 2 ? (
                  <RouteMap viajeId={viajeSeleccionado.id} waypoints={waypointsViajeActivo} telemetryPoints={telemetryList} routePreviewApiUrl={API_URL} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                    <div className="w-10 h-10 border-2 border-slate-700 border-t-white/20 rounded-full animate-spin" />
                    <p className="text-xs font-mono">Cargando trayectoria histórica...</p>
                  </div>
                )}
              </div>

              {/* Panel de exportación + gráfico */}
              <div className="h-[280px] shrink-0 bg-black border border-white/[0.08] rounded-2xl flex flex-col overflow-hidden transition-colors duration-500">
                <div className="flex justify-between items-center border-b border-white/[0.08] px-4 py-2.5 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-white/70" />
                    Certificación y Exportación
                  </span>
                  {viajeSeleccionado && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExportCSV(viajeSeleccionado)}
                        className="flex items-center gap-2 bg-black hover:bg-white/6 border border-white/10 hover:border-white/20 text-white font-bold rounded-xl px-3.5 py-1.5 text-[10px] uppercase tracking-wider transition-all duration-300 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                        <span>CSV</span>
                      </button>
                      <button
                        onClick={() => handleExportPDF(viajeSeleccionado)}
                        className="flex items-center gap-2 bg-black hover:bg-white/6 border border-white/10 hover:border-white/20 text-white font-bold rounded-xl px-3.5 py-1.5 text-[10px] uppercase tracking-wider transition-all duration-300 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>PDF</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 p-4 overflow-y-auto no-scrollbar">
                  {viajeSeleccionado ? (
                    <div className="flex gap-4 h-full items-stretch">
                      <div className="w-[130px] shrink-0 bg-black border border-white/[0.08] p-3 rounded-xl flex flex-col justify-center gap-2">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Parámetros</span>
                        <div className="text-[11px] font-mono text-white/70 font-bold">Máx: {viajeSeleccionado.limite_max_temp || 5}°C</div>
                        <div className="text-[11px] font-mono text-sky-400 font-bold">Mín: {viajeSeleccionado.limite_min_temp || 1}°C</div>
                        <div className="h-px bg-white/5 my-1" />
                        <span className="text-[8px] font-mono text-slate-600">{viajeSeleccionado.peso_kg || 0} Kg</span>
                        <span className="text-[8px] font-mono text-slate-600">{viajeSeleccionado.volumen_m3 || 0} m³</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <TelemetryChart
                          telemetryData={telemetryList}
                          limiteMin={Number(viajeSeleccionado.limite_min_temp || 1)}
                          limiteMax={Number(viajeSeleccionado.limite_max_temp || 5)}
                          isLoading={isTelemetryLoading}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono">
                      Selecciona un envío para ver su gráfico de trazabilidad.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className={`h-full shrink-0 transition-all duration-300 ${
              isRightCollapsed ? "w-0 opacity-0 pointer-events-none border-none p-0 m-0" : "w-[330px]"
            }`}>
              <AiInsightsPanel
                viaje={viajeSeleccionado}
                telemetryList={telemetryList}
                apiUrl={API_URL}
                simulatorState={simState}
                onOpenZepModal={() => setIsZepModalOpen(true)}
              />
            </aside>
          </main>
        ) : currentView === "admin" ? (
          <main className={`flex-1 flex p-3 gap-3 overflow-hidden h-full transition-[margin-left] duration-300 ease-in-out ${sidebarExpanded ? "ml-[240px]" : "ml-[64px]"}`}>
            <AdminPanel apiUrl={API_URL} />
          </main>
        ) : (
          <main className={`flex-1 flex p-3 gap-3 overflow-hidden h-full transition-[margin-left] duration-300 ease-in-out ${sidebarExpanded ? "ml-[240px]" : "ml-[64px]"}`}>
            <GraphExplorer
              apiUrl={API_URL}
              viajes={viajes}
              selectedTripId={viajeSeleccionado?.id}
              onSelectTrip={(tripId) => {
                const found = viajes.find((v) => v.id === tripId);
                setViajeSeleccionado(found || null);
              }}
            />
          </main>
        )}
      </div>

      {viajeSeleccionado && (
        <>
          <ZepAuditModal
            isOpen={isZepModalOpen}
            onClose={() => setIsZepModalOpen(false)}
            viaje={viajeSeleccionado}
            telemetryList={telemetryList}
            apiUrl={API_URL}
          />

           {viajeSeleccionado.estado === "finalizado" && currentView === "overview" && !viajeFinalizadoDismissed.includes(viajeSeleccionado.id) && (
             <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020408]/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
               <div className="max-w-md w-full bg-slate-900/95 border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-5 relative overflow-hidden">
                 {/* Decorative gradient overlay */}
                 <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/6 rounded-full blur-2xl" />
                 <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-white/6 rounded-full blur-2xl" />
                 
                 {/* Close Button */}
                 <button
                   onClick={() => setViajeFinalizadoDismissed((prev) => prev.includes(viajeSeleccionado.id) ? prev : [...prev, viajeSeleccionado.id])}
                   className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer z-10"
                 >
                   <X className="w-5 h-5" />
                 </button>

                 <div className="w-16 h-16 rounded-full bg-black border border-white/12 flex items-center justify-center animate-bounce">
                   <ShieldCheck className="w-9 h-9 text-white" />
                 </div>
                 
                 <div>
                   <h3 className="text-lg font-bold text-white uppercase tracking-wider text-center">¡Destino Alcanzado!</h3>
                   <p className="text-xs text-slate-400 mt-1 text-center">
                     El viaje de {viajeSeleccionado.tipo_producto || "Carga Sensible"} ha concluido exitosamente.
                   </p>
                 </div>
 
                 <div className="w-full bg-slate-950/50 rounded-2xl p-4 border border-white/5 space-y-3">
                   <div className="flex justify-between items-center text-xs font-mono">
                     <span className="text-slate-500">Cadena de Frío:</span>
                     {telemetryList.some((p) => p.temp > (viajeSeleccionado.limite_max_temp || 5) || p.temp < (viajeSeleccionado.limite_min_temp || 1)) ? (
                       <span className="px-2 py-0.5 rounded bg-black border border-white/10 text-white font-bold text-[10px]">
                         DESVIADA
                       </span>
                     ) : (
                       <span className="px-2 py-0.5 rounded bg-black border border-white/10 text-white font-bold text-[10px]">
                         CERTIFICADA
                       </span>
                     )}
                   </div>
 
                   <div className="h-px bg-white/5" />
 
                   <div className="text-left">
                     <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                       <Cpu className="w-3.5 h-3.5 text-purple-400" />
                       Auditoría de Calidad IA
                     </div>
                     {viajeSeleccionado.auditoria_ia ? (
                       <p className="text-[11px] text-slate-300 leading-relaxed font-sans line-clamp-4">
                         {viajeSeleccionado.auditoria_ia}
                       </p>
                     ) : (
                       <div className="flex items-center gap-2 py-1 text-slate-500 text-[11px]">
                         <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-purple-400 rounded-full animate-spin" />
                         <span>Compilando veredicto y cargando certificado...</span>
                       </div>
                     )}
                   </div>
                 </div>
 
                 <div className="grid grid-cols-2 gap-2.5 w-full">
                   <button
                     onClick={() => handleExportPDF(viajeSeleccionado)}
                     className="flex items-center justify-center gap-2 py-2 px-3 bg-black border border-white/14 hover:bg-white/6 text-white rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                   >
                     <FileText className="w-4 h-4" />
                     Certificado PDF
                   </button>
                   <button
                     onClick={() => handleExportCSV(viajeSeleccionado)}
                     className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                   >
                     <FileSpreadsheet className="w-4 h-4" />
                     Datos CSV
                   </button>
                   <button
                     onClick={() => setCurrentView("compliance")}
                     className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                   >
                     <History className="w-4 h-4" />
                     Ver Historial
                   </button>
                   <button
                     onClick={() => { resetModalForm(); setIsModalOpen(true); }}
                     className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                   >
                     <Plus className="w-4 h-4" />
                     Nuevo Envío
                   </button>
                 </div>

                 <button
                   onClick={() => setViajeFinalizadoDismissed((prev) => prev.includes(viajeSeleccionado.id) ? prev : [...prev, viajeSeleccionado.id])}
                   className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2"
                 >
                   Cerrar Ventana
                 </button>
               </div>
             </div>
           )}
        </>
      )}

      {/* ── MODAL DE REGISTRO ── */}
      {isModalOpen && (() => {
        // Dynamic unique list of companies
        const uniqueEmpresas = Array.from(new Set([
          ...sucursales.map(s => s.empresa_nombre).filter(Boolean),
          ...transportes.map(t => t.empresa_nombre).filter(Boolean)
        ]));

        // Filtering by selected company
        const filteredSucursales = selectedEmpresa 
          ? sucursales.filter(s => s.empresa_nombre === selectedEmpresa)
          : sucursales;

        const filteredVehicles = selectedEmpresa
          ? transportes.filter(t => t.empresa_nombre === selectedEmpresa)
          : transportes;

        // Vehicle search query
        const searchedVehicles = filteredVehicles.filter((t) =>
          [t.placa, t.empresa_nombre, t.estado]
            .join(" ")
            .toLowerCase()
            .includes(vehicleSearch.toLowerCase())
        );

        const selectedVehicle = transportes.find((t) => t.id === transporteIdForm);

        // Group searched vehicles by company for listing
        const vehiclesByEmpresa: Record<string, Transporte[]> = {};
        searchedVehicles.forEach((t) => {
          const key = t.empresa_nombre || "General / Independientes";
          if (!vehiclesByEmpresa[key]) vehiclesByEmpresa[key] = [];
          vehiclesByEmpresa[key].push(t);
        });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#020408]/85 backdrop-blur-md overflow-y-auto p-4 md:p-6"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); resetModalForm(); } }}
          >
            <div className="relative w-full max-w-5xl rounded-2xl border border-white/10 bg-[#050505] shadow-[0_24px_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[92vh] overflow-hidden">
              
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/8 bg-[#0a0a0a]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-tight uppercase">Nuevo Despacho Termocontrolado</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Asigne sucursales, vehículos, umbrales y verifique la ruta en tiempo real</p>
                  </div>
                </div>
                <button
                  onClick={() => { setIsModalOpen(false); resetModalForm(); }}
                  className="text-slate-500 hover:text-slate-200 transition-colors cursor-pointer p-1.5 hover:bg-white/5 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body: Form + Map (Two-Column Layout) */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                
                {/* Left Side: Scrollable Form */}
                <form
                  id="new-viaje-form"
                  onSubmit={handleCreateViaje}
                  className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 scrollbar-thin"
                >
                  {/* Empresa / Tenant Selector (Contextual Filter) */}
                  <section className="bg-white/[0.015] border border-white/6 p-4 rounded-xl">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">A</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Empresa / Cliente Asociado</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">Filtro Contextual</span>
                    </div>
                    <div className="w-full">
                      <ModalSelect value={selectedEmpresa} onChange={setSelectedEmpresa}>
                        <option value="">Todas las empresas disponibles (Sin prefiltrar)</option>
                        {uniqueEmpresas.map((emp) => (
                          <option key={emp} value={emp}>{emp}</option>
                        ))}
                      </ModalSelect>
                      <p className="text-[9px] text-slate-500 mt-1.5 font-sans">
                        Al seleccionar una empresa específica, el listado de sucursales (origen/destino) y vehículos se adaptará automáticamente a sus recursos asignados.
                      </p>
                    </div>
                  </section>

                  {/* Sección 1: Ruta */}
                  <section className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">01 · Sucursales de Trayecto</span>
                      <div className="flex-1 h-px bg-white/6" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ModalField label="Sucursal de Origen">
                        <ModalSelect
                          value={sucursalOrigenIdForm}
                          onChange={setSucursalOrigenIdForm}
                        >
                          <option value="">Seleccione origen...</option>
                          {filteredSucursales.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre} {!selectedEmpresa && `(${s.empresa_nombre})`}
                            </option>
                          ))}
                        </ModalSelect>
                      </ModalField>

                      <ModalField label="Sucursal de Destino">
                        <ModalSelect
                          value={sucursalDestinoIdForm}
                          onChange={setSucursalDestinoIdForm}
                        >
                          <option value="">Seleccione destino...</option>
                          {filteredSucursales.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre} {!selectedEmpresa && `(${s.empresa_nombre})`}
                            </option>
                          ))}
                        </ModalSelect>
                      </ModalField>
                    </div>
                  </section>

                  {/* Sección 2: Vehículo con Combobox */}
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">02 · Unidad de Transporte</span>
                      <div className="flex-1 h-px bg-white/6" />
                    </div>

                    <div className="relative">
                      <ModalField label="Vehículo Asignado">
                        <div ref={vehicleDropRef} className="relative mt-1">
                          <button
                            type="button"
                            onClick={handleToggleVehicleDrop}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-[11px] transition-all duration-150 cursor-pointer ${
                              vehicleDropOpen
                                ? "border-white/20 bg-black ring-2 ring-white/6"
                                : "border-white/10 bg-black hover:border-white/20"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {selectedVehicle ? (
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono font-bold text-white text-[12px]">{selectedVehicle.placa}</span>
                                  <span className="text-slate-400 truncate text-[10px]">({selectedVehicle.empresa_nombre})</span>
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                    selectedVehicle.estado === "disponible"
                                      ? "bg-black border border-white/10 text-white"
                                      : "bg-slate-800 text-slate-400 border border-slate-700/30"
                                  }`}>
                                    {selectedVehicle.estado}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-sans">Buscar y seleccionar vehículo...</span>
                              )}
                            </div>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${vehicleDropOpen ? "rotate-180" : ""}`} />
                          </button>

                          {vehicleDropOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 z-30 rounded-lg border border-white/10 bg-[#080808] shadow-[0_16px_40px_rgba(0,0,0,0.9)] overflow-hidden">
                              {/* Búsqueda en el combobox */}
                              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 bg-[#0c0c0c]">
                                <Search className="w-3 h-3 text-slate-400 shrink-0" />
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Filtrar por placa, capacidad o marca..."
                                  value={vehicleSearch}
                                  onChange={(e) => setVehicleSearch(e.target.value)}
                                  className="flex-1 bg-transparent outline-none text-[11px] text-slate-200 placeholder:text-slate-650 font-sans"
                                />
                                {vehicleSearch && (
                                  <button type="button" onClick={() => setVehicleSearch("")} className="text-slate-500 hover:text-slate-350">
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Lista de vehículos agrupados */}
                              <div className="max-h-52 overflow-y-auto">
                                {Object.keys(vehiclesByEmpresa).length === 0 ? (
                                  <div className="px-4 py-6 text-center text-[10px] text-slate-500 font-mono">
                                    Ningún vehículo coincide con &quot;{vehicleSearch}&quot;
                                  </div>
                                ) : (
                                  Object.entries(vehiclesByEmpresa).map(([empresa, vehicles]) => (
                                    <div key={empresa}>
                                      <div className="px-3 py-1.5 bg-white/[0.015] border-b border-white/6">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-sky-400">{empresa}</span>
                                      </div>
                                      {vehicles.map((t) => (
                                        <button
                                          type="button"
                                          key={t.id}
                                          onClick={() => { setTransporteIdForm(t.id); setVehicleDropOpen(false); setVehicleSearch(""); }}
                                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 cursor-pointer border-b border-white/4 last:border-0 ${
                                            transporteIdForm === t.id ? "bg-white/8" : "hover:bg-white/[0.02]"
                                          }`}
                                        >
                                          <span className="font-mono text-[12px] font-bold text-white w-24 shrink-0">{t.placa}</span>
                                          <span className="text-[10px] text-slate-400 flex-1 truncate">{(t.capacidad_carga_kg ?? 0).toLocaleString()} kg de cap.</span>
                                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                            t.estado === "disponible"
                                              ? "bg-black border border-white/10 text-white"
                                              : "bg-slate-800 text-slate-400"
                                          }`}>
                                            {t.estado}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ))
                                )}
                              </div>

                              {transporteIdForm && (
                                <div className="border-t border-white/6 bg-black px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => { setTransporteIdForm(""); setVehicleDropOpen(false); }}
                                    className="text-[9px] text-white/70 hover:text-white/90 cursor-pointer transition-colors uppercase tracking-wider font-semibold"
                                  >
                                    Limpiar Selección
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </ModalField>
                    </div>
                  </section>

                  {/* Sección 3: Carga */}
                  <section className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">03 · Especificaciones de Carga y Recetario</span>
                      <div className="flex-1 h-px bg-white/6" />
                    </div>

                    <div className="w-full">
                      <ModalField label="Recetario / Perfil de Producto (Auto-completa límites)">
                        <ModalSelect
                          value={perfilProductoIdForm}
                          onChange={handlePerfilChange}
                        >
                          <option value="">Personalizado (Carga manual sin perfil)</option>
                          {perfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} (Temp: {p.limite_min_temp}°C a {p.limite_max_temp}°C, Hum: {p.limite_min_humedad}% a {p.limite_max_humedad}%)
                            </option>
                          ))}
                        </ModalSelect>
                      </ModalField>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ModalField label="Tipo de Producto / Categoría">
                        <ModalInput
                          type="text"
                          placeholder="Ej: Vacunas, Lácteos, Flores..."
                          value={tipoProductoForm}
                          onChange={setTipoProductoForm}
                          disabled={!!perfilProductoIdForm}
                        />
                      </ModalField>
                      <ModalField label="Valor Declarado (USD)">
                        <ModalInput
                          type="number"
                          placeholder="0.00"
                          value={valorComercialForm}
                          onChange={setValorComercialForm}
                        />
                      </ModalField>
                      <ModalField label="Masa Neta (Kg)">
                        <ModalInput
                          type="number"
                          placeholder="0"
                          value={pesoKgForm}
                          onChange={setPesoKgForm}
                        />
                      </ModalField>
                      <ModalField label="Volumen de Cubaje (m³)">
                        <ModalInput
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={volumenM3Form}
                          onChange={setVolumenM3Form}
                        />
                      </ModalField>
                    </div>
                  </section>

                  {/* Sección 4: Temperatura, Humedad y Estado */}
                  <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">04 · Control Térmico, Humedad y Operativo</span>
                      <div className="flex-1 h-px bg-white/6" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ModalField label="Temp. Mínima Permitida (°C)">
                        <ModalInput
                          type="number"
                          placeholder="1"
                          value={limiteMinTempForm}
                          onChange={setLimiteMinTempForm}
                          disabled={!!perfilProductoIdForm}
                        />
                      </ModalField>
                      <ModalField label="Temp. Máxima Permitida (°C)">
                        <ModalInput
                          type="number"
                          placeholder="5"
                          value={limiteMaxTempForm}
                          onChange={setLimiteMaxTempForm}
                          disabled={!!perfilProductoIdForm}
                        />
                      </ModalField>
                      <ModalField label="Humedad Mínima Permitida (%)">
                        <ModalInput
                          type="number"
                          placeholder="0"
                          value={limiteMinHumForm}
                          onChange={setLimiteMinHumForm}
                          disabled={!!perfilProductoIdForm}
                        />
                      </ModalField>
                      <ModalField label="Humedad Máxima Permitida (%)">
                        <ModalInput
                          type="number"
                          placeholder="100"
                          value={limiteMaxHumForm}
                          onChange={setLimiteMaxHumForm}
                          disabled={!!perfilProductoIdForm}
                        />
                      </ModalField>
                    </div>

                    {/* Visual range bar */}
                    <div className="bg-black border border-white/6 rounded-xl p-3.5 flex items-center justify-between gap-6">
                      <div className="flex-1 relative">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden relative">
                          <div 
                            className="absolute h-full rounded-full bg-white/16"
                            style={{ left: "25%", right: "30%" }}
                          />
                        </div>
                        <div className="flex justify-between mt-2 text-[8px] font-mono text-slate-400 tracking-wider">
                          <span>UMBRAL FRÍO</span>
                          <span>TEMPERADO</span>
                          <span>ALTA TEMP</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[8px] text-slate-400 uppercase tracking-widest font-mono">Margen de Seguridad</p>
                        <p className="text-[11px] font-mono font-bold text-sky-300 mt-0.5">
                          T: {limiteMinTempForm || "0"}°C a {limiteMaxTempForm || "0"}°C
                        </p>
                        <p className="text-[10px] font-mono font-bold text-sky-300/80">
                          H: {limiteMinHumForm || "0"}% a {limiteMaxHumForm || "100"}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-2">
                      <ModalField label="Estado Operativo de Inicio">
                        <div className="grid grid-cols-2 gap-3 mt-1.5">
                          {(["pendiente", "en_curso"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setEstadoForm(opt)}
                              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                                estadoForm === opt
                                  ? "border-sky-500/40 bg-sky-500/5 shadow-[0_0_12px_rgba(14,165,233,0.06)]"
                                  : "border-white/10 bg-black hover:border-white/16"
                              }`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt === "en_curso" ? "bg-sky-400" : "bg-amber-400"}`} />
                              <div>
                                <p className="text-[11px] font-semibold text-white capitalize">{opt === "en_curso" ? "En Curso" : "Pendiente"}</p>
                                <p className="text-[9px] text-slate-500 mt-0.5 font-sans">
                                  {opt === "pendiente" ? "Despacho por activar" : "Comenzar telemetría ahora"}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ModalField>
                    </div>
                  </section>

                  {/* Errores */}
                  {submitError && (
                    <div className="flex items-start gap-2.5 text-[11px] text-rose-350 bg-rose-950/20 border border-rose-900/30 rounded-xl px-4 py-3">
                      <svg className="w-4 h-4 shrink-0 mt-0.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      {submitError}
                    </div>
                  )}
                </form>

                {/* Right Side: Map Preview (Desktop Only) */}
                <div className="w-full lg:w-[350px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/8 bg-[#050505] flex flex-col overflow-hidden">
                  
                  <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
                    <div>
                      <p className="text-[8px] font-mono tracking-widest text-slate-500 uppercase">Geovisor Dinámico</p>
                      <p className="text-[11px] font-bold text-slate-300 mt-0.5">Vista Previa del Trayecto</p>
                    </div>
                    {waypointsFormModal.length === 2 && (
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-white/70 uppercase tracking-wider">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/20 opacity-60" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        Ruta Lista
                      </span>
                    )}
                  </div>

                  {/* Map visualization */}
                  <div className="flex-1 relative overflow-hidden min-h-[250px] lg:min-h-0 bg-[#020202]">
                    {mapMounted && (
                      <RouteMap
                        waypoints={waypointsFormModal}
                        routePreviewApiUrl={API_URL}
                        center={waypointsFormModal[0]
                          ? [waypointsFormModal[0].lat, waypointsFormModal[0].lon]
                          : [13.6929, -89.2182]}
                        zoom={11}
                      />
                    )}
                    {waypointsFormModal.length === 0 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/95">
                        <div className="w-11 h-11 rounded-xl border border-white/10 bg-[#050505]/85 flex items-center justify-center shadow-lg shadow-black/20">
                          <svg className="w-4.5 h-4.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                          </svg>
                        </div>
                        <div className="text-center px-4">
                          <p className="text-[10px] font-semibold text-slate-400">Sin Trayecto de Ruta</p>
                          <p className="text-[9px] text-slate-500 font-sans mt-1">Especifique sucursales de origen y destino para previsualizar geoposiciones</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary grid */}
                  <div className="border-t border-white/8 bg-black p-4 grid grid-cols-2 gap-2 shrink-0">
                    {[
                      { k: "Mercancía", v: tipoProductoForm || "—" },
                      { k: "Carga total", v: pesoKgForm ? `${Number(pesoKgForm).toLocaleString()} kg` : "—" },
                      { k: "Valor Asegurado", v: valorComercialForm ? `$${Number(valorComercialForm).toLocaleString()} USD` : "—" },
                      { k: "Rango Óptimo", v: limiteMinTempForm && limiteMaxTempForm ? `${limiteMinTempForm}°C a ${limiteMaxTempForm}°C` : "—" },
                    ].map(({ k, v }) => (
                      <div key={k} className="bg-white/[0.015] rounded-lg px-3 py-2 border border-white/6">
                        <p className="text-[7px] font-mono uppercase tracking-widest text-slate-500">{k}</p>
                        <p className="text-[10px] font-bold text-slate-300 truncate mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>

                </div>

              </div>

              {/* Sticky Footer actions */}
              <div className="border-t border-white/8 bg-[#0a0a0a] px-6 py-4 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetModalForm(); }}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-200 px-4 py-2 cursor-pointer transition-colors rounded-lg hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="new-viaje-form"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 text-[11px] font-bold text-white px-6 py-2.5 rounded-xl border border-sky-500/20 bg-sky-500/10 hover:bg-sky-500/20 hover:border-sky-400/40 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Registrando Despacho...
                    </>
                  ) : (
                    <>
                      Activar Monitoreo Térmico
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ─── MICRO COMPONENTS ──────────────────────────────────────────────────────────

function StatusPill({ label, status }: { label: string; status: "up" | "down" | "degraded" }) {
  const dotColorClass = status === "up" ? "bg-white" : "bg-white/80";
  const pingColorClass = "bg-white/20";

  return (
    <div className="flex items-center gap-1.5 bg-black border border-white/[0.10] px-2.5 py-1 rounded-lg">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColorClass} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColorClass}`} />
      </span>
      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

interface ZepNode {
  name: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface ZepEdge {
  fact: string;
  source: string;
  target: string;
  type: string;
}

function formatMarkdown(text: string) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseBold = (line: string, key: string | number) => {
    // Also highlight backtick values `...` as monospace tokens
    const parts = line.split(/(`[^`]+`|\*\*[\s\S]*?\*\*)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <span key={`${key}-b-${pIdx}`} className="text-white font-bold">
            {part.slice(2, -2)}
          </span>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={`${key}-c-${pIdx}`} className="font-mono text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/30 text-[9px] tracking-wide">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${key}-t-${pIdx}`}>{part}</span>;
    });
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      elements.push(<div key={i} className="h-3" />);
      i++;
      continue;
    }

    // H2 heading: ##
    if (line.startsWith("## ")) {
      const text = line.replace(/^##\s*/, "");
      elements.push(
        <div key={i} className="flex items-center gap-3 mt-5 mb-3 pb-2 border-b border-white/[0.08]">
          <div className="w-0.5 h-5 bg-gradient-to-b from-cyan-400 to-indigo-500 rounded-full" />
          <h2 className="text-sm font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent uppercase tracking-widest font-sans">
            {text}
          </h2>
        </div>
      );
      i++;
      continue;
    }

    // H3 heading: ###
    if (line.startsWith("###")) {
      const text = line.replace(/^###\s*/, "");
      elements.push(
        <div key={i} className="flex items-center gap-2 mt-4 mb-2">
          <Sparkles className="w-3 h-3 text-cyan-500 shrink-0" />
          <h3 className="text-[11px] font-bold text-cyan-300 uppercase tracking-widest">
            {text}
          </h3>
        </div>
      );
      i++;
      continue;
    }

    // H1: #
    if (line.startsWith("# ")) {
      const text = line.replace(/^#\s*/, "");
      elements.push(
        <div key={i} className="mt-2 mb-4">
          <h1 className="text-base font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent font-sans tracking-wide">
            {text}
          </h1>
        </div>
      );
      i++;
      continue;
    }

    // Bullet: - or *
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("+ ")) {
      const content = line.replace(/^[-*+]\s*/, "");
      elements.push(
        <div key={i} className="flex items-start gap-3 py-1 pl-1 group">
          <div className="w-1 h-1 rounded-full bg-cyan-500/70 mt-[7px] shrink-0" />
          <p className="text-[11px] text-zinc-300 font-mono leading-relaxed flex-1">
            {parseBold(content, i)}
          </p>
        </div>
      );
      i++;
      continue;
    }

    // Numbered list: 1. 2. etc
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex items-start gap-3 py-1 pl-1">
          <span className="text-[9px] font-bold font-mono text-cyan-500/70 mt-0.5 shrink-0 w-4 text-right">
            {numberedMatch[1]}.
          </span>
          <p className="text-[11px] text-zinc-300 font-mono leading-relaxed flex-1">
            {parseBold(numberedMatch[2], i)}
          </p>
        </div>
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[11px] text-zinc-400 font-mono leading-relaxed">
        {parseBold(line, i)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function GraphExplorer({
  apiUrl,
  viajes,
  selectedTripId,
  onSelectTrip,
}: {
  apiUrl: string;
  viajes: Viaje[];
  selectedTripId?: string;
  onSelectTrip: (tripId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<ZepNode[]>([]);
  const [edges, setEdges] = useState<ZepEdge[]>([]);
  const [sintesis, setSintesis] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterByTrip, setFilterByTrip] = useState(!!selectedTripId);

  // Restaurar estado del grafo desde localStorage al montar el componente (sólo lado del cliente)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedQuery = localStorage.getItem("zep_query");
      const savedSintesis = localStorage.getItem("zep_sintesis");
      const savedNodes = localStorage.getItem("zep_nodes");
      const savedEdges = localStorage.getItem("zep_edges");

      if (savedQuery) setQuery(savedQuery);
      if (savedSintesis) setSintesis(savedSintesis);
      if (savedNodes) {
        try { setNodes(JSON.parse(savedNodes)); } catch (e) {}
      }
      if (savedEdges) {
        try { setEdges(JSON.parse(savedEdges)); } catch (e) {}
      }
      if (savedQuery || savedSintesis) {
        setHasSearched(true);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterByTrip(!!selectedTripId);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedTripId]);

  const handleSearch = async (searchTerm: string) => {
    // Salvaguarda crítica: Evitar búsquedas vacías o con espacios en blanco
    if (!searchTerm || !searchTerm.trim()) {
      return;
    }
    setIsLoading(true);
    setHasSearched(true);
    setSintesis("");
    try {
      const bodyPayload: { query: string; viajeId?: string } = { query: searchTerm.trim() };
      if (filterByTrip && selectedTripId) {
        bodyPayload.viajeId = selectedTripId;
      }
      const res = await apiFetch(`${apiUrl}/ia/grafo/sintetizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setSintesis(data.sintesis || "");

        // Persistir en localStorage para resiliencia frente a recargas (F5)
        if (typeof window !== "undefined") {
          localStorage.setItem("zep_query", searchTerm.trim());
          localStorage.setItem("zep_sintesis", data.sintesis || "");
          localStorage.setItem("zep_nodes", JSON.stringify(data.nodes || []));
          localStorage.setItem("zep_edges", JSON.stringify(data.edges || []));
        }
      }
    } catch (err) {
      console.error("Error al buscar en el grafo de Zep:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const quickSearch = (term: string) => {
    if (!term || !term.trim()) return;
    setQuery(term);
    handleSearch(term);
  };

  return (
    <div className="flex-grow flex flex-col h-full p-4 sm:p-6 gap-4 bg-black border border-white/[0.06] rounded-3xl shadow-2xl relative overflow-hidden">

      {/* ── HEADER ── shrink-0 so it never grows */}
      <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-4 shrink-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 p-2 rounded-xl border border-cyan-500/25 shadow-[0_0_20px_rgba(6,182,212,0.12)]">
            <Network className="w-4 h-4 text-cyan-400" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent font-sans">
            Explorador de Grafo de Conocimiento IA
          </h2>
          <span className="text-[9px] font-mono px-2.5 py-1 rounded-md bg-cyan-950/60 text-cyan-400 border border-cyan-500/20 tracking-widest uppercase shadow-[inset_0_1px_0_rgba(6,182,212,0.1)]">
            Zep Memory
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 font-mono pl-0.5">
          Consulta la red de conocimiento semántico aprendida por la IA a partir de telemetrías y alertas del sistema.
        </p>
      </div>

      {/* ── SEARCH PANEL ── shrink-0 */}
      <div className="flex flex-col gap-3 bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 border border-white/[0.05] px-4 py-3.5 rounded-2xl shrink-0 z-10 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        {/* Trip selector row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 select-none">
            <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">Viaje:</span>
            <div className="relative">
              <select
                value={selectedTripId || "global"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "global") { onSelectTrip(""); } else { onSelectTrip(val); }
                }}
                className="bg-zinc-900/80 border border-white/[0.07] hover:border-white/15 rounded-lg pl-3 pr-7 py-1.5 text-[11px] text-zinc-300 font-mono outline-none focus:border-cyan-500/40 cursor-pointer w-full sm:max-w-[260px] transition-all duration-200 appearance-none"
              >
                <option value="global" className="bg-zinc-900 text-zinc-200">Grafo Global — Todos los viajes</option>
                {viajes.map((v) => (
                  <option key={v.id} value={v.id} className="bg-zinc-900 text-zinc-200">
                    {v.tipo_producto || "Perecedero"} · {v.id.slice(0, 8)} · {v.estado}
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                <ChevronDown className="w-3 h-3" />
              </div>
            </div>
          </div>
          {selectedTripId && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterByTrip}
                onChange={(e) => setFilterByTrip(e.target.checked)}
                className="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] text-zinc-500 font-mono hover:text-zinc-300 transition-colors">
                Solo este viaje
              </span>
            </label>
          )}
        </div>

        {/* Search input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="falla, temperatura, camión, incidente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/[0.05] rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:border-cyan-500/30 focus:bg-black/60 font-mono transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-white hover:bg-zinc-100 text-black font-bold px-5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest transition-all duration-200 cursor-pointer disabled:opacity-40 active:scale-[0.97] shrink-0"
          >
            {isLoading ? "..." : "Buscar"}
          </button>
        </form>

        {/* Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-mono text-zinc-700 tracking-widest uppercase shrink-0">Sugerencias:</span>
          {["falla", "temperatura", "batería", "camión", "incidente", "excursión"].map((term) => (
            <button
              key={term}
              onClick={() => quickSearch(term)}
              className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.04] hover:border-cyan-500/20 text-zinc-500 hover:text-cyan-300 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer active:scale-95"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* ── WORKSPACE ── flex-1 min-h-0 = fills remaining space, never overflows */}
      <div className="flex-1 min-h-0 z-10 flex flex-col">
        {isLoading ? (
          /* Loading */
          <div className="flex-1 flex items-center justify-center border border-dashed border-white/[0.05] rounded-2xl bg-zinc-950/20">
            <div className="text-center font-mono">
              <div className="relative mx-auto mb-4 w-8 h-8">
                <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-ping" />
                <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-zinc-800 animate-spin" />
              </div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Interrogando grafo semántico...</p>
            </div>
          </div>
        ) : !hasSearched ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/[0.05] rounded-2xl bg-gradient-to-b from-zinc-950/30 to-black/20 relative overflow-hidden">
            {/* Decorative grid */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 40px)"
            }} />
            <div className="relative text-center max-w-sm px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-white/[0.07] flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(6,182,212,0.05)]">
                <Network className="w-7 h-7 text-zinc-600" />
              </div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-zinc-300 to-zinc-600 bg-clip-text text-transparent uppercase tracking-widest mb-2">
                Búsqueda Semántica de Grafo
              </h3>
              <p className="text-[10px] text-zinc-700 font-mono leading-relaxed">
                Escribe una consulta arriba para interrogar el grafo Zep. Se recuperarán relaciones e incidentes correlacionados vectorialmente.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2">
                {["falla", "temperatura", "excursión"].map((t) => (
                  <button key={t} onClick={() => quickSearch(t)}
                    className="text-[9px] font-mono px-2.5 py-1 rounded border border-white/[0.05] text-zinc-600 hover:text-cyan-400 hover:border-cyan-500/20 transition-colors cursor-pointer">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : edges.length === 0 && nodes.length === 0 ? (
          /* No results */
          <div className="flex-1 flex items-center justify-center border border-dashed border-white/[0.05] rounded-2xl bg-zinc-950/20">
            <div className="text-center max-w-sm px-6">
              <div className="w-12 h-12 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <Network className="w-6 h-6 text-zinc-700" />
              </div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Sin resultados</p>
              <p className="text-[10px] text-zinc-700 font-mono mt-1.5">
                No hay relaciones para &quot;{query}&quot;
              </p>
            </div>
          </div>
        ) : (
          /* ── RESULTS: Synthesis (dominant) + Relations (right column) ── */
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">

            {/* LEFT — AI Synthesis Briefing (dominant panel) */}
            {sintesis ? (
              <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-b from-zinc-950/70 to-black/60 border border-cyan-500/20 rounded-2xl overflow-hidden relative" style={{boxShadow: '0 0 60px rgba(6,182,212,0.04), inset 0 1px 0 rgba(6,182,212,0.1)'}}>
                {/* Top glow line */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
                {/* Ambient inner glow */}
                <div className="absolute top-0 left-0 w-[300px] h-[200px] bg-cyan-500/3 rounded-full blur-[80px] pointer-events-none" />

                {/* ── Panel Header ── */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 p-2.5 rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                      <Bot className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent uppercase tracking-widest font-sans">
                        Informe de Trazabilidad IA
                      </h3>
                      <p className="text-[9px] text-cyan-500/70 font-mono tracking-[0.2em] uppercase mt-0.5">
                        GraphSync Briefing · Síntesis de Incidentes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    <span className="text-[9px] font-mono font-bold uppercase px-2.5 py-1 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-500/25 tracking-widest">
                      LIVE REPORT
                    </span>
                  </div>
                </div>

                {/* ── Panel Body ── */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                  {formatMarkdown(sintesis)}
                </div>
              </div>
            ) : null}

            {/* RIGHT — Semantic Relations (solo panel) */}
            <div className={`${sintesis ? "w-full lg:w-[360px] shrink-0" : "flex-1"} min-h-0 flex flex-col bg-zinc-950/40 border border-white/[0.06] rounded-2xl overflow-hidden relative`}>
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-white/[0.05] shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                  <span className="text-xs font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent uppercase tracking-widest">
                    Relaciones Semánticas
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-zinc-900 border border-white/[0.06] text-zinc-500 px-2 py-0.5 rounded-md tracking-widest">
                  {edges.length} hechos
                </span>
              </div>

              {/* Edges list */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {edges.map((edge, i) => (
                  <div key={i} className="group bg-black/40 border border-white/[0.04] hover:border-cyan-500/20 rounded-xl p-3.5 flex flex-col gap-2.5 transition-all duration-200">
                    {/* Source → Relation → Target */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-900/40 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                        {edge.source}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-3 h-px bg-zinc-700" />
                        <span className="text-[8px] font-mono text-zinc-600 bg-zinc-900/60 border border-white/[0.04] px-1.5 py-0.5 rounded uppercase tracking-wider">
                          {edge.type || "REL"}
                        </span>
                        <div className="w-3 h-px bg-zinc-700" />
                      </div>
                      <span className="text-[9px] font-bold font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900/40 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                        {edge.target}
                      </span>
                    </div>
                    {/* Fact */}
                    <p className="text-[10px] text-zinc-500 font-mono leading-relaxed group-hover:text-zinc-300 transition-colors duration-200 pl-0.5">
                      {edge.fact}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}


function StatCard({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-slate-950/40 border border-white/[0.05] p-3 rounded-xl">
      <span className="text-[8px] font-mono uppercase text-slate-500 tracking-widest block mb-1">{label}</span>
      <span className={`text-sm font-bold block ${valueClass}`}>{value}</span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-300 font-medium truncate">{value}</span>
    </div>
  );
}

// ─── NAV ITEM ──────────────────────────────────────────────────────────────────

function NavItem({
  icon: Icon,
  label,
  view,
  currentView,
  sidebarExpanded,
  onNavigate,
  href,
}: {
  icon: React.ElementType;
  label: string;
  view?: "overview" | "compliance" | "graph-explorer" | "admin";
  currentView?: "overview" | "compliance" | "graph-explorer" | "admin";
  sidebarExpanded: boolean;
  onNavigate?: (v: "overview" | "compliance" | "graph-explorer" | "admin") => void;
  href?: string;
}) {
  const isActive = view ? currentView === view : false;
  const content = (
    <div className={`flex items-center gap-3 w-full py-2.5 rounded-xl transition-all duration-300 ${
      isActive
        ? "bg-white/6 border border-white/15 text-white font-bold"
        : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
    } ${sidebarExpanded ? "px-3 justify-start" : "justify-center"}`}>
      <Icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-300 ${isActive ? "scale-110" : ""}`} />
      {sidebarExpanded && (
        <span className="text-[11px] tracking-wide transition-all duration-300 whitespace-nowrap flex-1 text-left">
          {label}
        </span>
      )}
      {sidebarExpanded && isActive && (
        <svg className="w-3.5 h-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );

  return (
    <div className="group relative w-full">
      {href ? (
        <Link href={href} className="w-full text-left bg-transparent p-0 border-0 outline-none block cursor-pointer">
          {content}
        </Link>
      ) : (
        <button
          onClick={() => {
            if (view) {
              onNavigate?.(view);
            }
          }}
          className="w-full text-left bg-transparent p-0 border-0 outline-none cursor-pointer"
        >
          {content}
        </button>
      )}
      {!sidebarExpanded && (
        <div className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 rounded-lg bg-black border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-white opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 z-[100] whitespace-nowrap shadow-2xl shadow-black/40">
          {label}
        </div>
      )}
    </div>
  );
}

// ─── VIAJE CARD ────────────────────────────────────────────────────────────────

interface ViajeCardProps {
  viaje: Viaje;
  isHistorico?: boolean;
  isSelected: boolean;
  isSubmitting: boolean;
  onSelect: (v: Viaje) => void;
  onIniciar: (id: string) => void;
  onPausar?: (id: string) => void;
  onReanudar?: (id: string) => void;
  onCancelar?: (id: string) => void;
}

function ViajeCard({
  viaje,
  isHistorico = false,
  isSelected,
  isSubmitting,
  onSelect,
  onIniciar,
  onPausar,
  onReanudar,
  onCancelar,
}: ViajeCardProps) {
  const isEnCurso = viaje.estado === "en_curso";
  const isPausado = viaje.estado === "pausado";
  return (
    <div
      onClick={() => onSelect(viaje)}
      className={`border rounded-xl p-3.5 cursor-pointer transition-colors duration-300 ${
        isSelected
          ? "border-white/20 bg-white/5"
          : "border-white/[0.08] bg-black hover:border-white/16 hover:bg-white/4"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-mono text-[11px] font-bold text-white tracking-wider">
          #{viaje.id.substring(0, 8).toUpperCase()}
        </span>
        {isHistorico ? (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-black text-white/70 border border-white/10 uppercase tracking-wider">
            Cerrado
          </span>
        ) : (
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
              isEnCurso
                ? "bg-black text-white border border-white/10"
                : isPausado
                  ? "bg-black text-white border border-white/10"
                  : "bg-black text-white border border-white/10"
            }`}
          >
            {isEnCurso && (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/20 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
            )}
            {viaje.estado}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="truncate">{viaje.tipo_producto || "No especificado"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
          </svg>
          <span>{viaje.limite_min_temp ?? 0}°C — {viaje.limite_max_temp}°C</span>
        </div>
        {isHistorico && viaje.final_viaje && (
          <div className="text-[9px] text-slate-650 pt-0.5 font-mono">
            Cerrado: {new Date(viaje.final_viaje).toLocaleDateString()}
          </div>
        )}
      </div>
      {!isHistorico && viaje.estado === "pendiente" && (
        <div className="mt-3">
          <button
            onClick={(e) => { e.stopPropagation(); onIniciar(viaje.id); }}
            disabled={isSubmitting}
            className="text-[9px] font-bold tracking-widest uppercase px-3 py-1.5 w-full rounded-lg bg-black border border-white/10 hover:border-white/20 text-white transition-all duration-300 cursor-pointer disabled:opacity-40"
          >
            {isSubmitting ? "Iniciando..." : "▶  Iniciar Viaje"}
          </button>
        </div>
      )}
      {!isHistorico && (isEnCurso || isPausado) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {isEnCurso && onPausar && (
            <button
              onClick={(e) => { e.stopPropagation(); onPausar(viaje.id); }}
              disabled={isSubmitting}
              className="text-[8px] font-bold tracking-widest uppercase px-2 py-1.5 rounded-lg bg-black border border-white/10 hover:border-white/20 text-white transition-all duration-300 cursor-pointer disabled:opacity-40"
            >
              Pausar
            </button>
          )}
          {isPausado && onReanudar && (
            <button
              onClick={(e) => { e.stopPropagation(); onReanudar(viaje.id); }}
              disabled={isSubmitting}
              className="text-[8px] font-bold tracking-widest uppercase px-2 py-1.5 rounded-lg bg-black border border-white/10 hover:border-white/20 text-white transition-all duration-300 cursor-pointer disabled:opacity-40"
            >
              Reanudar
            </button>
          )}
          {onCancelar && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancelar(viaje.id); }}
              disabled={isSubmitting}
              className="text-[8px] font-bold tracking-widest uppercase px-2 py-1.5 rounded-lg bg-black border border-white/10 hover:border-white/20 text-white transition-all duration-300 cursor-pointer disabled:opacity-40"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MODAL HELPER COMPONENTS ───────────────────────────────────────────────────

function ModalField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
      <label
        className="text-[9px] uppercase font-mono tracking-[0.15em] font-bold text-slate-400"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black border border-white/10 rounded-lg px-3 py-2.5 text-[11px] text-slate-200 outline-none cursor-pointer transition-all duration-200 focus:border-white/25 font-sans"
      >
        {children}
      </select>
    </div>
  );
}
function ModalInput({
  type,
  placeholder,
  value,
  onChange,
  step,
  disabled,
}: {
  type: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2.5 text-[11px] text-slate-200 outline-none transition-all duration-200 focus:border-white/25 font-mono placeholder:text-slate-700 disabled:opacity-55 disabled:bg-[#050505] disabled:cursor-not-allowed"
    />
  );
}

// ─── ADMIN PANEL COMPONENT ───────────────────────────────────────────────────

interface AdminEmpresa {
  id: string;
  nombre: string;
}

interface AdminSucursal {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  direccion?: string | null;
  lat: number | string;
  lon: number | string;
}

interface AdminTransporte {
  id: string;
  placa: string;
  iot_id: string;
  empresa_id: string;
  empresa_nombre?: string;
  estado: "Activo" | "Mantenimiento";
  capacidad?: number | string | null;
}

function AdminPanel({ apiUrl }: { apiUrl: string }) {
  const [empresas, setEmpresas] = useState<AdminEmpresa[]>([]);
  const [sucursales, setSucursales] = useState<AdminSucursal[]>([]);
  const [transportes, setTransportes] = useState<AdminTransporte[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form states
  const [empresaNombre, setEmpresaNombre] = useState("");

  const [sucursalEmpresaId, setSucursalEmpresaId] = useState("");
  const [sucursalNombre, setSucursalNombre] = useState("");
  const [sucursalDireccion, setSucursalDireccion] = useState("");
  const [sucursalLat, setSucursalLat] = useState("");
  const [sucursalLon, setSucursalLon] = useState("");

  const [transporteEmpresaId, setTransporteEmpresaId] = useState("");
  const [transportePlaca, setTransportePlaca] = useState("");
  const [transporteEstado, setTransporteEstado] = useState<"Activo" | "Mantenimiento">("Activo");
  const [transporteCapacidad, setTransporteCapacidad] = useState("");

  const getHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [resEmp, resSuc, resTrans] = await Promise.all([
        apiFetch(`${apiUrl}/empresa`),
        apiFetch(`${apiUrl}/sucursal`),
        apiFetch(`${apiUrl}/transporte`),
      ]);

      if (resEmp.ok) {
        const empData = await resEmp.json();
        setEmpresas(Array.isArray(empData) ? empData : []);
      }
      if (resSuc.ok) {
        const sucData = await resSuc.json();
        setSucursales(Array.isArray(sucData) ? sucData : []);
      }
      if (resTrans.ok) {
        const transData = await resTrans.json();
        setTransportes(Array.isArray(transData) ? transData : []);
      }
    } catch (err) {
      console.error("Error al cargar datos administrativos:", err);
      setFeedback({ type: "error", message: "No pudimos conectar con el backend." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const [resEmp, resSuc, resTrans] = await Promise.all([
          apiFetch(`${apiUrl}/empresa`),
          apiFetch(`${apiUrl}/sucursal`),
          apiFetch(`${apiUrl}/transporte`),
        ]);
        if (resEmp.ok) {
          const empData = await resEmp.json();
          setEmpresas(Array.isArray(empData) ? empData : []);
        }
        if (resSuc.ok) {
          const sucData = await resSuc.json();
          setSucursales(Array.isArray(sucData) ? sucData : []);
        }
        if (resTrans.ok) {
          const transData = await resTrans.json();
          setTransportes(Array.isArray(transData) ? transData : []);
        }
      } catch (err) {
        console.error("Error al cargar datos administrativos:", err);
        setFeedback({ type: "error", message: "No pudimos conectar con el backend." });
      } finally {
        setIsLoading(false);
      }
    };
    void fetchInitialData();
  }, [apiUrl]);

  const handleCreateEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaNombre.trim()) return;

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`${apiUrl}/empresa`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ nombre: empresaNombre.trim() }),
      });

      if (!res.ok) {
        throw new Error("No pudimos crear la empresa.");
      }

      setEmpresaNombre("");
      setFeedback({ type: "success", message: "Empresa creada correctamente." });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear la empresa.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSucursal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sucursalEmpresaId || !sucursalNombre.trim() || !sucursalLat || !sucursalLon) {
      setFeedback({ type: "error", message: "Por favor, completa todos los campos requeridos." });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`${apiUrl}/sucursal`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          empresa_id: sucursalEmpresaId,
          nombre: sucursalNombre.trim(),
          direccion: sucursalDireccion.trim() || undefined,
          lat: parseFloat(sucursalLat),
          lon: parseFloat(sucursalLon),
        }),
      });

      if (!res.ok) {
        throw new Error("No pudimos crear la sucursal.");
      }

      setSucursalNombre("");
      setSucursalDireccion("");
      setSucursalLat("");
      setSucursalLon("");
      setFeedback({ type: "success", message: "Sucursal registrada correctamente." });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear la sucursal.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTransporte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transporteEmpresaId || !transportePlaca.trim()) {
      setFeedback({ type: "error", message: "La placa y la empresa son obligatorias." });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      // 1. Register virtual IoT device first
      const iotRes = await apiFetch(`${apiUrl}/iot`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          tipo_dispositivo: "Sensor Térmico GPS",
          estado_conexion: "Activo",
          ultimo_ping: new Date().toISOString(),
          firmware_version: "v1.0.0",
        }),
      });

      if (!iotRes.ok) {
        throw new Error("No se pudo crear el dispositivo virtual IoT.");
      }

      const iotData = await iotRes.json();
      const generatedIotId = iotData.id;

      // 2. Register the vehicle (transporte)
      const transRes = await apiFetch(`${apiUrl}/transporte`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          placa: transportePlaca.toUpperCase().trim(),
          iot_id: generatedIotId,
          empresa_id: transporteEmpresaId,
          estado: transporteEstado,
          capacidad: transporteCapacidad ? parseFloat(transporteCapacidad) : undefined,
        }),
      });

      if (!transRes.ok) {
        throw new Error("No se pudo crear el transporte.");
      }

      setTransportePlaca("");
      setTransporteCapacidad("");
      setFeedback({ type: "success", message: "Vehículo y sensor IoT registrados correctamente." });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar el transporte.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full overflow-hidden p-6 gap-6 bg-black border border-white/[0.06] rounded-3xl shadow-2xl relative select-none">
      {/* Background radial gradients */}
      <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* HEADER */}
      <div className="flex flex-col gap-1.5 border-b border-white/[0.06] pb-5 shrink-0 z-10">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2.5">
          <div className="bg-zinc-800/30 p-2 rounded-xl border border-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.03)]">
            <Building className="w-4 h-4 text-zinc-300" />
          </div>
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Administración de Entidades Logísticas
          </span>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-white/10 tracking-widest uppercase">
            Control Panel
          </span>
        </h2>
        <p className="text-[11px] text-zinc-400 font-mono">
          Registra y gestiona las empresas, sucursales (geocercas) y vehículos de transporte con telemetría activa.
        </p>
      </div>

      {/* FEEDBACK STATUS BANNER */}
      {feedback && (
        <div
          className={`rounded-2xl border px-4.5 py-3 text-[11px] font-mono flex items-center justify-between shrink-0 shadow-lg z-10 transition-all ${
            feedback.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
              : "border-rose-500/20 bg-rose-500/5 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${feedback.type === 'success' ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* GRID CONTAINER */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden min-h-0">
        
        {/* COLUMN 1: EMPRESAS */}
        <div className="bg-zinc-950/40 border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden shadow-xl z-10 backdrop-blur-md">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-white/[0.04] pb-3 shrink-0">
            <Building className="w-4 h-4 text-cyan-400" />
            1. Registrar Empresa
          </h3>

          <form onSubmit={handleCreateEmpresa} className="flex flex-col gap-3 shrink-0">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Nombre de Empresa</label>
              <input
                type="text"
                required
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                placeholder="Ej. Exportadora del Norte"
                className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 placeholder-zinc-700 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !empresaNombre.trim()}
              className="w-full bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-2.5 text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-white/5 active:scale-[0.98]"
            >
              Registrar
            </button>
          </form>

          <div className="flex-grow overflow-hidden flex flex-col gap-2 min-h-0">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest shrink-0 mt-2">Empresas ({empresas.length})</span>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {empresas.map((emp) => (
                <div key={emp.id} className="bg-zinc-950/60 border border-white/[0.03] rounded-xl p-3.5 flex flex-col gap-1.5 transition duration-200 hover:border-white/10 hover:bg-zinc-900/10">
                  <p className="text-[11px] font-bold text-zinc-100 font-mono tracking-tight">{emp.nombre}</p>
                  <p className="text-[8px] text-zinc-600 font-mono truncate tracking-tight">ID: {emp.id}</p>
                </div>
              ))}
              {empresas.length === 0 && (
                <p className="text-zinc-700 text-[10px] font-mono text-center py-12">Sin empresas registradas.</p>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: SUCURSALES */}
        <div className="bg-zinc-950/40 border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden shadow-xl z-10 backdrop-blur-md">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-white/[0.04] pb-3 shrink-0">
            <MapPin className="w-4 h-4 text-emerald-400" />
            2. Registrar Sucursal
          </h3>

          <form onSubmit={handleCreateSucursal} className="flex flex-col gap-3 shrink-0">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Empresa</label>
              <div className="relative">
                <select
                  required
                  value={sucursalEmpresaId}
                  onChange={(e) => setSucursalEmpresaId(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl pl-3 pr-8 py-2.5 text-xs text-zinc-200 outline-none cursor-pointer transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 appearance-none font-mono"
                >
                  <option value="" className="bg-zinc-950 text-zinc-400">Selecciona una empresa...</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id} className="bg-zinc-950 text-zinc-200">{e.nombre}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Nombre de Sucursal</label>
              <input
                type="text"
                required
                value={sucursalNombre}
                onChange={(e) => setSucursalNombre(e.target.value)}
                placeholder="Ej. CD Querétaro"
                className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 placeholder-zinc-700 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Latitud</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={sucursalLat}
                  onChange={(e) => setSucursalLat(e.target.value)}
                  placeholder="Ej. 20.5888"
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 placeholder-zinc-700 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Longitud</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={sucursalLon}
                  onChange={(e) => setSucursalLon(e.target.value)}
                  placeholder="Ej. -100.389"
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 placeholder-zinc-700 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Dirección (Opcional)</label>
              <input
                type="text"
                value={sucursalDireccion}
                onChange={(e) => setSucursalDireccion(e.target.value)}
                placeholder="Industrial CD Qro"
                className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 placeholder-zinc-700 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !sucursalEmpresaId || !sucursalNombre.trim()}
              className="w-full bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-2.5 text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-white/5 active:scale-[0.98]"
            >
              Registrar
            </button>
          </form>

          <div className="flex-grow overflow-hidden flex flex-col gap-2 min-h-0">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest shrink-0 mt-2">Sucursales ({sucursales.length})</span>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {sucursales.map((suc) => (
                <div key={suc.id} className="bg-zinc-950/60 border border-white/[0.03] rounded-xl p-3.5 flex flex-col gap-2 transition duration-200 hover:border-white/10 hover:bg-zinc-900/10">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-[11px] font-bold text-zinc-100 font-mono tracking-tight">{suc.nombre}</p>
                    <span className="text-[8px] bg-zinc-900/80 text-zinc-400 px-2 py-0.5 rounded-full border border-white/5 font-mono truncate max-w-[100px]">{suc.empresa_nombre}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[9px] text-zinc-500 font-mono">GPS: {suc.lat}, {suc.lon}</p>
                    {suc.direccion && <p className="text-[9px] text-zinc-500/80 italic font-mono mt-0.5 truncate">{suc.direccion}</p>}
                  </div>
                </div>
              ))}
              {sucursales.length === 0 && (
                <p className="text-zinc-700 text-[10px] font-mono text-center py-12">Sin sucursales registradas.</p>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 3: VEHÍCULOS / TRANSPORTE */}
        <div className="bg-zinc-950/40 border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden shadow-xl z-10 backdrop-blur-md">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-white/[0.04] pb-3 shrink-0">
            <Truck className="w-4 h-4 text-violet-400" />
            3. Registrar Vehículo
          </h3>

          <form onSubmit={handleCreateTransporte} className="flex flex-col gap-3 shrink-0">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Empresa Propietaria</label>
              <div className="relative">
                <select
                  required
                  value={transporteEmpresaId}
                  onChange={(e) => setTransporteEmpresaId(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl pl-3 pr-8 py-2.5 text-xs text-zinc-200 outline-none cursor-pointer transition focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 appearance-none font-mono"
                >
                  <option value="" className="bg-zinc-950 text-zinc-400">Selecciona una empresa...</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id} className="bg-zinc-950 text-zinc-200">{e.nombre}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Placa (Patente)</label>
                <input
                  type="text"
                  required
                  value={transportePlaca}
                  onChange={(e) => setTransportePlaca(e.target.value)}
                  placeholder="Ej. QRO-772"
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 placeholder-zinc-700 font-mono uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Capacidad (Kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={transporteCapacidad}
                  onChange={(e) => setTransporteCapacidad(e.target.value)}
                  placeholder="Ej. 18000"
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none transition focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 placeholder-zinc-700 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Estado Inicial</label>
              <div className="relative">
                <select
                  required
                  value={transporteEstado}
                  onChange={(e) => setTransporteEstado(e.target.value as "Activo" | "Mantenimiento")}
                  className="w-full bg-zinc-950 border border-white/[0.06] rounded-xl pl-3 pr-8 py-2.5 text-xs text-zinc-200 outline-none cursor-pointer transition focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 appearance-none font-mono"
                >
                  <option value="Activo" className="bg-zinc-950 text-zinc-200">Activo</option>
                  <option value="Mantenimiento" className="bg-zinc-950 text-zinc-200">Mantenimiento</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !transporteEmpresaId || !transportePlaca.trim()}
              className="w-full bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-2.5 text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-white/5 active:scale-[0.98]"
            >
              Registrar
            </button>
          </form>

          <div className="flex-grow overflow-hidden flex flex-col gap-2 min-h-0">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest shrink-0 mt-2">Vehículos & IoT ({transportes.length})</span>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {transportes.map((trans) => {
                const owner = empresas.find(e => e.id === trans.empresa_id);
                return (
                  <div key={trans.id} className="bg-zinc-950/60 border border-white/[0.03] rounded-xl p-3.5 flex flex-col gap-2 transition duration-200 hover:border-white/10 hover:bg-zinc-900/10">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-[11px] font-bold text-zinc-100 font-mono tracking-tight">{trans.placa}</p>
                      <span className={`inline-flex items-center gap-1.5 text-[8px] px-2 py-0.5 rounded-full border font-mono ${
                        trans.estado === "Activo" 
                          ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.05)]"
                          : "bg-amber-500/5 border-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.05)]"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${trans.estado === 'Activo' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        {trans.estado}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {owner && <p className="text-[9px] text-zinc-500 font-mono">Empresa: {owner.nombre}</p>}
                      <p className="text-[8px] text-zinc-600 font-mono truncate">IoT Link: <span className="text-zinc-500 bg-zinc-950 px-1 py-0.5 border border-white/[0.02] rounded font-mono text-[7px]">{trans.iot_id}</span></p>
                      {trans.capacidad && <p className="text-[9px] text-zinc-500 font-mono">Capacidad: {Number(trans.capacidad).toLocaleString()} Kg</p>}
                    </div>
                  </div>
                );
              })}
              {transportes.length === 0 && (
                <p className="text-zinc-700 text-[10px] font-mono text-center py-12">Sin vehículos registrados.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}