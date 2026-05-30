/**
 * ZepMemoryService — COLDCASE v2
 *
 * Servicio responsable de persistir y recuperar contexto desde Zep Cloud
 * usando la API de Standalone Graphs de @getzep/zep-cloud v3.22.x.
 *
 * Flujo de persistencia:
 *  1. Asegurar que el usuario exista en Zep (getOrCreate)
 *  2. Agregar datos (documentos/texto) al Grafo de Conocimiento del usuario.
 *  3. Buscar en el grafo por contexto relevante (búsqueda semántica).
 *
 * El servicio está diseñado para ser resiliente: cualquier fallo de Zep
 * se registra como warning pero NUNCA interrumpe el flujo principal.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Zep, ZepClient } from '@getzep/zep-cloud';

/** Resultado al guardar datos en Zep Graph */
export interface ZepSaveResult {
  success: boolean;
  userId: string;
  error?: string;
}

/** Contexto recuperado del Grafo de Zep */
export interface ZepHistorialResult {
  messages: string;
  messageCount: number;
}

export interface ZepGraphNode {
  name: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface ZepGraphEdge {
  fact: string;
  source: string;
  target: string;
  type: string;
}

export interface ZepGraphSearchResult {
  nodes: ZepGraphNode[];
  edges: ZepGraphEdge[];
}

@Injectable()
export class ZepMemoryService {
  private readonly logger = new Logger(ZepMemoryService.name);

  /**
   * Timeout en milisegundos para operaciones individuales contra Zep.
   * Evita que un Zep lento bloquee el pipeline de telemetría.
   */
  private static readonly ZEP_TIMEOUT_MS = 8000;

  constructor(
    @Optional()
    @Inject('ZEP_CLIENT')
    private readonly zepClient: ZepClient | null,
  ) {
    if (this.zepClient) {
      this.logger.log(
        'ZepMemoryService inicializado con cliente Zep Cloud (Graph API)',
      );
    } else {
      this.logger.warn(
        'ZepMemoryService inicializado SIN cliente Zep (ZEP_API_KEY no configurada)',
      );
    }
  }

  /** Indica si el cliente de Zep está disponible */
  get isAvailable(): boolean {
    return this.zepClient !== null;
  }

  private readonly graphId = 'coldcase-global-graph';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // OPERACIONES PÚBLICAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Guarda un par de mensajes (sensor + respuesta IA) en el Grafo de Zep de una sola vez.
   *
   * @param viajeId         - ID del viaje para contextualizar la entrada
   * @param mensajeSensor   - Contenido de la telemetría del sensor
   * @param respuestaIA     - Respuesta del análisis de IA
   * @param metadata        - Metadata opcional
   */
  async guardarInteraccion(
    viajeId: string,
    mensajeSensorOrSemanticText: string,
    respuestaIA?: string | Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<ZepSaveResult> {
    const graphId = this.graphId;

    let dataToSave = mensajeSensorOrSemanticText;
    let actualMetadata = metadata;

    if (typeof respuestaIA === 'string') {
      // Comportamiento legado de múltiples parámetros
      dataToSave = `Viaje ID: ${viajeId}\nAlerta del Sensor: ${mensajeSensorOrSemanticText}\nResolución de IA: ${respuestaIA}`;
    } else if (respuestaIA && typeof respuestaIA === 'object') {
      // Si el tercer parámetro era en realidad la metadata
      actualMetadata = respuestaIA;
    }

    return this.addDataToGraph(graphId, dataToSave, {
      viajeId,
      ...actualMetadata,
    });
  }

  /**
   * (Deprecado/Mantenido por compatibilidad)
   * Guarda un mensaje aislado del sensor.
   */
  async guardarMensajeUsuario(
    viajeId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ZepSaveResult> {
    const graphId = this.graphId;
    return this.addDataToGraph(
      graphId,
      `Viaje ID: ${viajeId}\nAlerta del Sensor: ${content}`,
      { viajeId, ...metadata },
    );
  }

  /**
   * (Deprecado/Mantenido por compatibilidad)
   * Guarda un mensaje aislado del LLM.
   */
  async guardarRespuestaLLM(
    viajeId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ZepSaveResult> {
    const graphId = this.graphId;
    return this.addDataToGraph(
      graphId,
      `Viaje ID: ${viajeId}\nResolución de IA: ${content}`,
      { viajeId, ...metadata },
    );
  }

  /**
   * Recupera el contexto global de anomalías desde el Grafo de Zep.
   *
   * @param viajeId  - ID del viaje (mantenido por compatibilidad)
   * @param query    - El mensaje o anomalía actual para buscar coincidencias en el grafo global
   * @returns        - String formateado con el historial relacional relevante
   */
  async recuperarContextoGlobal(
    viajeId: string,
    query: string,
  ): Promise<ZepHistorialResult> {
    if (!this.zepClient) {
      return { messages: '', messageCount: 0 };
    }

    const graphId = this.graphId;

    try {
      // 1. Asegurar que el grafo Standalone existe
      await this.ensureGraph(graphId);

      let response: Zep.GraphSearchResults | undefined;

      // Fase 1: Intentar buscar con PropertyFilters (para hechos creados con AddData)
      if (viajeId) {
        try {
          response = await this.withTimeout(
            this.zepClient.graph.search({
              graphId,
              query,
              searchFilters: {
                propertyFilters: [
                  {
                    propertyName: 'viajeId',
                    propertyValue: viajeId,
                    comparisonOperator: '=',
                  },
                ],
              },
            }),
          );
        } catch (err) {
          this.logger.warn(
            `Zep: Búsqueda con propertyFilters falló en recuperarContextoGlobal: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Fase 2: Si no hay viajeId o la Fase 1 retornó vacío, intentar con EpisodeMetadataFilters
      if (viajeId && !response?.nodes?.length && !response?.edges?.length) {
        try {
          response = await this.withTimeout(
            this.zepClient.graph.search({
              graphId,
              query,
              searchFilters: {
                episodeMetadataFilters: {
                  type: 'or',
                  filters: [
                    {
                      propertyName: 'viajeId',
                      propertyValue: viajeId,
                      comparisonOperator: '=',
                    },
                    {
                      propertyName: 'viaje_id',
                      propertyValue: viajeId,
                      comparisonOperator: '=',
                    },
                  ],
                },
              },
            }),
          );
        } catch (err) {
          this.logger.warn(
            `Zep: Búsqueda con episodeMetadataFilters falló en recuperarContextoGlobal: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Fase 3: Búsqueda global con filtrado en memoria ultra-resiliente
      if (!response?.nodes?.length && !response?.edges?.length) {
        response = await this.withTimeout(
          this.zepClient.graph.search({
            graphId,
            query,
          }),
        );

        if (viajeId && response) {
          const filteredEdges = (response.edges || []).filter((edge) => {
            const edgeObj = edge as unknown as Record<string, unknown>;
            const attrs = (edgeObj['attributes'] ||
              edgeObj['properties'] ||
              {}) as Record<string, unknown>;
            return (
              attrs['viajeId'] === viajeId || attrs['viaje_id'] === viajeId
            );
          });
          response = { ...response, edges: filteredEdges };
        }
      }

      // Zep GraphSearchResults devuelve edges y nodes
      const edges = response?.edges ?? [];
      if (!edges.length) {
        return { messages: '', messageCount: 0 };
      }

      // Formatear las relaciones encontradas (ej. Nodo1 -> Relación -> Nodo2)
      const formatted = edges
        .map((edge) => {
          return `- [Conocimiento Previo]: ${edge.fact || edge.name || 'Sin detalle'}`;
        })
        .join('\n');

      return { messages: formatted, messageCount: edges.length };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Zep: Fallo al recuperar contexto global del grafo para ${graphId}: ${message}`,
      );
      return { messages: '', messageCount: 0 };
    }
  }

  /**
   * Realiza una búsqueda semántica por similitud en la memoria del viaje.
   *
   * @param viajeId - ID del viaje
   * @param query   - Query o anomalía actual para buscar coincidencias
   */
  async searchMemory(
    viajeId: string,
    query: string,
  ): Promise<ZepHistorialResult> {
    return this.recuperarContextoGlobal(viajeId, query);
  }

  /**
   * Alias de compatibilidad para recuperarHistorial que llama a recuperarContextoGlobal.
   * Por defecto usará un query genérico si no se provee.
   */
  async recuperarHistorial(viajeId: string): Promise<ZepHistorialResult> {
    return this.recuperarContextoGlobal(
      viajeId,
      'Anomalías y fallas previas en este viaje',
    );
  }

  /**
   * Realiza una búsqueda directa en el Grafo de Zep retornando la respuesta en bruto (nodos y aristas).
   */
  async buscarEnGrafoDirecto(
    query: string,
    viajeId?: string,
  ): Promise<ZepGraphSearchResult> {
    if (!this.zepClient) {
      return { nodes: [], edges: [] };
    }
    const graphId = this.graphId;
    try {
      await this.ensureGraph(graphId);

      let response: Zep.GraphSearchResults | undefined;

      // Fase 1: Intentar buscar con PropertyFilters (para hechos creados con AddData)
      if (viajeId) {
        try {
          response = await this.withTimeout(
            this.zepClient.graph.search({
              graphId,
              query: query || 'anomalía',
              searchFilters: {
                propertyFilters: [
                  {
                    propertyName: 'viajeId',
                    propertyValue: viajeId,
                    comparisonOperator: '=',
                  },
                ],
              },
            }),
          );
        } catch (err) {
          this.logger.warn(
            `Zep: Búsqueda con propertyFilters falló en buscarEnGrafoDirecto: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Fase 2: Si no hay viajeId o la Fase 1 retornó vacío, intentar con EpisodeMetadataFilters
      if (viajeId && !response?.nodes?.length && !response?.edges?.length) {
        try {
          response = await this.withTimeout(
            this.zepClient.graph.search({
              graphId,
              query: query || 'anomalía',
              searchFilters: {
                episodeMetadataFilters: {
                  type: 'or',
                  filters: [
                    {
                      propertyName: 'viajeId',
                      propertyValue: viajeId,
                      comparisonOperator: '=',
                    },
                    {
                      propertyName: 'viaje_id',
                      propertyValue: viajeId,
                      comparisonOperator: '=',
                    },
                  ],
                },
              },
            }),
          );
        } catch (err) {
          this.logger.warn(
            `Zep: Búsqueda con episodeMetadataFilters falló en buscarEnGrafoDirecto: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Fase 3: Búsqueda global con filtrado en memoria ultra-resiliente
      if (!response?.nodes?.length && !response?.edges?.length) {
        response = await this.withTimeout(
          this.zepClient.graph.search({
            graphId,
            query: query || 'anomalía',
          }),
        );

        if (viajeId && response) {
          // Filtrado en memoria ultra-resiliente (busca tanto en attributes como en properties)
          const filteredNodes = (response.nodes || []).filter((node) => {
            const nodeObj = node as unknown as Record<string, unknown>;
            const attrs = (nodeObj['attributes'] ||
              nodeObj['properties'] ||
              {}) as Record<string, unknown>;
            return (
              attrs['viajeId'] === viajeId || attrs['viaje_id'] === viajeId
            );
          });

          const filteredEdges = (response.edges || []).filter((edge) => {
            const edgeObj = edge as unknown as Record<string, unknown>;
            const attrs = (edgeObj['attributes'] ||
              edgeObj['properties'] ||
              {}) as Record<string, unknown>;
            return (
              attrs['viajeId'] === viajeId || attrs['viaje_id'] === viajeId
            );
          });

          return {
            nodes: filteredNodes as unknown as ZepGraphNode[],
            edges: filteredEdges as unknown as ZepGraphEdge[],
          };
        }
      }

      return {
        nodes: (response?.nodes || []) as unknown as ZepGraphNode[],
        edges: (response?.edges || []) as unknown as ZepGraphEdge[],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Zep: Fallo al realizar búsqueda directa en el grafo ${graphId}: ${msg}`,
      );
      return { nodes: [], edges: [] };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS PRIVADOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Agrega datos no estructurados al grafo independiente de Zep.
   */
  private async addDataToGraph(
    graphId: string,
    data: string,
    metadata?: Record<string, unknown>,
  ): Promise<ZepSaveResult> {
    if (!this.zepClient) {
      return {
        success: false,
        userId: graphId,
        error: 'Cliente Zep no disponible',
      };
    }

    try {
      await this.ensureGraph(graphId);

      await this.withTimeout(
        this.zepClient.graph.add({
          graphId,
          data,
          type: 'text',
          metadata,
        }),
      );

      this.logger.debug(
        `Zep: Datos agregados al grafo independiente ${graphId}`,
      );
      return { success: true, userId: graphId };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Zep: Error al agregar datos al grafo ${graphId}: ${msg}`,
      );
      return { success: false, userId: graphId, error: msg };
    }
  }

  /**
   * Garantiza que el Grafo Standalone exista en Zep.
   */
  private async ensureGraph(graphId: string): Promise<void> {
    if (!this.zepClient) return;

    try {
      await this.withTimeout(
        this.zepClient.graph.create({
          graphId,
          name: 'Coldcase Global Graph',
          description:
            'Grafo de conocimiento global para las anomalías de COLDCASE',
        }),
      );
      this.logger.debug(`Zep: Grafo standalone '${graphId}' creado/asegurado`);
    } catch (error: unknown) {
      if (!this.isBadRequestError(error)) {
        throw error;
      }
      // 400 = grafo ya existe -> OK
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Construye un userId determinista a partir de un viajeId */
  private buildUserId(viajeId: string): string {
    return `coldcase-sensor-${viajeId}`;
  }

  /**
   * Envuelve una promesa con un timeout para evitar bloqueos.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Zep timeout: operación excedió ${ZepMemoryService.ZEP_TIMEOUT_MS}ms`,
          ),
        );
      }, ZepMemoryService.ZEP_TIMEOUT_MS);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /** Verifica si el error es un BadRequest (400) — recurso ya existe */
  private isBadRequestError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err['statusCode'] === 400) return true;
      if (err['status'] === 400) return true;
      if (typeof err['name'] === 'string' && err['name'].includes('BadRequest'))
        return true;
      if (
        typeof err['message'] === 'string' &&
        (err['message'].includes('400') ||
          err['message'].toLowerCase().includes('already exists'))
      ) {
        return true;
      }
    }
    return false;
  }
}
