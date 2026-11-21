/**
 * Tipos generados a partir del esquema final de Supabase (migraciones
 * 0001–0015). Si cambias una migración, actualiza este archivo y ejecuta
 * `npm run typecheck`.
 *
 * No edites a mano los tipos `Row`/`Insert`/`Update` sin comprobar que el SQL
 * hace lo mismo: son el contrato entre la API y Postgres.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Permite instanciar createClient con los tipos correctos.
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_intentos: {
        Row: {
          correo: string
          creado_en: string
          exito: boolean
          id: number
          ip_hash: string
          motivo: string | null
        }
        Insert: {
          correo: string
          creado_en?: string
          exito: boolean
          id?: never
          ip_hash: string
          motivo?: string | null
        }
        Update: {
          correo?: string
          creado_en?: string
          exito?: boolean
          id?: never
          ip_hash?: string
          motivo?: string | null
        }
        Relationships: []
      }
      administradores: {
        Row: {
          creado_en: string
          rol: "admin" | "super"
          user_id: string
        }
        Insert: {
          creado_en?: string
          rol?: "admin" | "super"
          user_id: string
        }
        Update: {
          creado_en?: string
          rol?: "admin" | "super"
          user_id?: string
        }
        Relationships: []
      }
      consulta_intentos: {
        Row: {
          ci: string | null
          creado_en: string
          id: number
          ip_hash: string
        }
        Insert: {
          ci?: string | null
          creado_en?: string
          id?: never
          ip_hash: string
        }
        Update: {
          ci?: string | null
          creado_en?: string
          id?: never
          ip_hash?: string
        }
        Relationships: []
      }
      reporte_eventos: {
        Row: {
          admin_email: string | null
          creado_en: string
          estado_anterior: Database["public"]["Enums"]["estado_reporte"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_reporte"]
          id: number
          nota: string | null
          reporte_id: string
        }
        Insert: {
          admin_email?: string | null
          creado_en?: string
          estado_anterior?:
            | Database["public"]["Enums"]["estado_reporte"]
            | null
          estado_nuevo: Database["public"]["Enums"]["estado_reporte"]
          id?: never
          nota?: string | null
          reporte_id: string
        }
        Update: {
          admin_email?: string | null
          creado_en?: string
          estado_anterior?:
            | Database["public"]["Enums"]["estado_reporte"]
            | null
          estado_nuevo?: Database["public"]["Enums"]["estado_reporte"]
          id?: never
          nota?: string | null
          reporte_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporte_eventos_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reportes"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes: {
        Row: {
          actualizado_en: string
          ci: string
          correo: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_reporte"]
          id: string
          materia_codigo: string
          materia_nombre: string
          motivo: string
          nombre: string
          nrc: string
          perfil: string
          ticket: string
          tipo_error: Database["public"]["Enums"]["tipo_error_reporte"]
          tipo_error_detalle: string
        }
        Insert: {
          actualizado_en?: string
          ci: string
          correo: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_reporte"]
          id?: string
          materia_codigo: string
          materia_nombre: string
          motivo: string
          nombre: string
          nrc: string
          perfil?: string
          ticket?: string
          tipo_error: Database["public"]["Enums"]["tipo_error_reporte"]
          tipo_error_detalle?: string
        }
        Update: {
          actualizado_en?: string
          ci?: string
          correo?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_reporte"]
          id?: string
          materia_codigo?: string
          materia_nombre?: string
          motivo?: string
          nombre?: string
          nrc?: string
          perfil?: string
          ticket?: string
          tipo_error?: Database["public"]["Enums"]["tipo_error_reporte"]
          tipo_error_detalle?: string
        }
        Relationships: []
      }
      totp_credenciales: {
        Row: {
          actualizado_en: string
          bloqueado_hasta: string | null
          confirmado_en: string | null
          creado_en: string
          intentos_fallidos: number
          secreto_cifrado: string
          sujeto: string
          tipo: "admin" | "estudiante"
          ultimo_paso: number
        }
        Insert: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          confirmado_en?: string | null
          creado_en?: string
          intentos_fallidos?: number
          secreto_cifrado: string
          sujeto: string
          tipo: "admin" | "estudiante"
          ultimo_paso?: number
        }
        Update: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          confirmado_en?: string | null
          creado_en?: string
          intentos_fallidos?: number
          secreto_cifrado?: string
          sujeto?: string
          tipo?: "admin" | "estudiante"
          ultimo_paso?: number
        }
        Relationships: []
      }
      totp_enrolamiento: {
        Row: {
          ci: string | null
          codigo_hash: string
          creado_en: string
          creado_por: string
          expira_en: string
          id: string
          max_usos: number
          usado_en: string | null
        }
        Insert: {
          ci?: string | null
          codigo_hash: string
          creado_en?: string
          creado_por: string
          expira_en: string
          id?: string
          max_usos?: number
          usado_en?: string | null
        }
        Update: {
          ci?: string | null
          codigo_hash?: string
          creado_en?: string
          creado_por?: string
          expira_en?: string
          id?: string
          max_usos?: number
          usado_en?: string | null
        }
        Relationships: []
      }
      totp_enrolamiento_usos: {
        Row: {
          ci: string
          creado_en: string
          enrolamiento_id: string
          id: number
        }
        Insert: {
          ci: string
          creado_en?: string
          enrolamiento_id: string
          id?: number
        }
        Update: {
          ci?: string
          creado_en?: string
          enrolamiento_id?: string
          id?: number
        }
        Relationships: []
      }
    }
    Views: {
      reportes_con_llegada: {
        Row: {
          ci: string
          numero_llegada: number
        }
        Relationships: []
      }
    }
    Functions: {
      cambiar_estado_reporte: {
        Args: {
          p_admin?: string
          p_estado: Database["public"]["Enums"]["estado_reporte"]
          p_id: string
          p_nota?: string
        }
        Returns: Json
      }
      cambiar_estado_lote: {
        Args: {
          p_admin?: string
          p_estado: Database["public"]["Enums"]["estado_reporte"]
          p_ids: string[]
          p_nota?: string
        }
        Returns: number
      }
      confirmar_totp: {
        Args: { p_paso: number; p_sujeto: string; p_tipo: string }
        Returns: boolean
      }
      consumir_enrolamiento: { Args: { p_ci: string }; Returns: undefined }
      crear_totp_pendiente: {
        Args: { p_secreto: string; p_sujeto: string; p_tipo: string }
        Returns: boolean
      }
      crear_reporte: {
        Args: {
          p_ci: string
          p_correo: string
          p_materia_codigo: string
          p_materia_nombre: string
          p_motivo: string
          p_nombre: string
          p_nrc: string
          p_perfil?: string
          p_tipo_error: Database["public"]["Enums"]["tipo_error_reporte"]
          p_tipo_error_detalle: string
        }
        Returns: Json
      }
      enrolar_estudiante: {
        Args: { p_ci: string; p_codigo_hash: string; p_secreto: string }
        Returns: Json
      }
      generar_codigo_enrolamiento: {
        Args: {
          p_ci: string
          p_codigo_hash: string
          p_creado_por: string
          p_expira_en: string
        }
        Returns: string
      }
      generar_codigo_lote: {
        Args: {
          p_codigo_hash: string
          p_creado_por: string
          p_expira_en: string
          p_max_usos: number
        }
        Returns: string
      }
      limpiar_codigos_vencidos: { Args: never; Returns: undefined }
      marcar_paso_totp: {
        Args: { p_paso: number; p_sujeto: string; p_tipo: string }
        Returns: boolean
      }
      registrar_fallo_totp: {
        Args: { p_sujeto: string; p_tipo: string }
        Returns: Json
      }
    }
    Enums: {
      estado_reporte: "pendiente" | "en-revision" | "resuelto"
      tipo_error_reporte:
        | "error-prerrequisito"
        | "error-correquisito"
        | "reserva-cerrada"
        | "cruce-horario"
        | "cambio-horario"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

/** Alias cómodos para no repetir Database["public"][...] en el código. */
export type EstadoReporteDb = Database["public"]["Enums"]["estado_reporte"]
export type TipoErrorDb = Database["public"]["Enums"]["tipo_error_reporte"]
export type FilaReporteDb = Database["public"]["Tables"]["reportes"]["Row"]
export type FilaEventoDb =
  Database["public"]["Tables"]["reporte_eventos"]["Row"]

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_reporte: ["pendiente", "en-revision", "resuelto"],
      tipo_error_reporte: [
        "error-prerrequisito",
        "error-correquisito",
        "reserva-cerrada",
        "cruce-horario",
        "cambio-horario",
        "otro",
      ],
    },
  },
} as const
