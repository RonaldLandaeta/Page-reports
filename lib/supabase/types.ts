export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
      administradores: {
        Row: {
          creado_en: string
          user_id: string
        }
        Insert: {
          creado_en?: string
          user_id: string
        }
        Update: {
          creado_en?: string
          user_id?: string
        }
        Relationships: []
      }
      codigos_verificacion: {
        Row: {
          codigo_hash: string
          consumido_en: string | null
          correo: string
          creado_en: string
          expira_en: string
          id: string
          intentos: number
          ip_hash: string | null
        }
        Insert: {
          codigo_hash: string
          consumido_en?: string | null
          correo: string
          creado_en?: string
          expira_en: string
          id?: string
          intentos?: number
          ip_hash?: string | null
        }
        Update: {
          codigo_hash?: string
          consumido_en?: string | null
          correo?: string
          creado_en?: string
          expira_en?: string
          id?: string
          intentos?: number
          ip_hash?: string | null
        }
        Relationships: []
      }
      consulta_intentos: {
        Row: {
          creado_en: string
          id: number
          ip_hash: string
        }
        Insert: {
          creado_en?: string
          id?: never
          ip_hash: string
        }
        Update: {
          creado_en?: string
          id?: never
          ip_hash?: string
        }
        Relationships: []
      }
      materias: {
        Row: {
          activo: boolean
          actualizado_en: string
          aula: string
          creado_en: string
          docente: string
          horario: string
          nombre: string
          nrc: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          aula?: string
          creado_en?: string
          docente?: string
          horario?: string
          nombre: string
          nrc: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          aula?: string
          creado_en?: string
          docente?: string
          horario?: string
          nombre?: string
          nrc?: string
        }
        Relationships: []
      }
      reporte_eventos: {
        Row: {
          creado_en: string
          estado_anterior: string | null
          estado_nuevo: string
          id: number
          nota: string | null
          reporte_id: string
        }
        Insert: {
          creado_en?: string
          estado_anterior?: string | null
          estado_nuevo: string
          id?: never
          nota?: string | null
          reporte_id: string
        }
        Update: {
          creado_en?: string
          estado_anterior?: string | null
          estado_nuevo?: string
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
          estado: string
          id: string
          materia_aula: string
          materia_nombre: string
          motivo: string
          nombre: string
          nrc: string
          ticket: string
          tipo_error: string
        }
        Insert: {
          actualizado_en?: string
          ci: string
          correo: string
          creado_en?: string
          estado?: string
          id?: string
          materia_aula?: string
          materia_nombre: string
          motivo: string
          nombre: string
          nrc: string
          ticket: string
          tipo_error: string
        }
        Update: {
          actualizado_en?: string
          ci?: string
          correo?: string
          creado_en?: string
          estado?: string
          id?: string
          materia_aula?: string
          materia_nombre?: string
          motivo?: string
          nombre?: string
          nrc?: string
          ticket?: string
          tipo_error?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_nrc_fkey"
            columns: ["nrc"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["nrc"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cambiar_estado_reporte: {
        Args: { p_estado: string; p_id: string; p_nota?: string }
        Returns: Json
      }
      consumir_codigo: { Args: { p_id: string }; Returns: boolean }
      limpiar_codigos_vencidos: { Args: never; Returns: undefined }
      registrar_intento_codigo: { Args: { p_id: string }; Returns: number }
      registrar_reporte: {
        Args: {
          p_ci: string
          p_correo: string
          p_motivo: string
          p_nombre: string
          p_nrc: string
          p_tipo_error: string
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

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
