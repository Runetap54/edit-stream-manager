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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admin_approvals: {
        Row: {
          action: string
          created_at: string | null
          expires_at: string | null
          id: string
          token: string | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          token?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          token?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_approvals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      error_events: {
        Row: {
          code: string | null
          correlation_id: string | null
          created_at: string | null
          id: number
          message: string | null
          method: string | null
          route: string | null
          safe_context: Json | null
          status: number | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: number
          message?: string | null
          method?: string | null
          route?: string | null
          safe_context?: Json | null
          status?: number | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: number
          message?: string | null
          method?: string | null
          route?: string | null
          safe_context?: Json | null
          status?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string
          project_id: string | null
          storage_key: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id: string
          project_id?: string | null
          storage_key: string
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string
          project_id?: string | null
          storage_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scene_generations: {
        Row: {
          created_at: string
          end_frame_url: string | null
          error_code: string | null
          error_message: string | null
          generation_id: string
          progress_pct: number | null
          scene_id: string
          shot_type: number
          shot_type_id: string | null
          start_frame_url: string
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          end_frame_url?: string | null
          error_code?: string | null
          error_message?: string | null
          generation_id?: string
          progress_pct?: number | null
          scene_id: string
          shot_type: number
          shot_type_id?: string | null
          start_frame_url: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          end_frame_url?: string | null
          error_code?: string | null
          error_message?: string | null
          generation_id?: string
          progress_pct?: number | null
          scene_id?: string
          shot_type?: number
          shot_type_id?: string | null
          start_frame_url?: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      scene_versions: {
        Row: {
          created_at: string | null
          id: string
          render_meta: Json | null
          scene_id: string
          version: number
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          render_meta?: Json | null
          scene_id: string
          version: number
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          render_meta?: Json | null
          scene_id?: string
          version?: number
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_versions_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          end_frame_signed_url: string | null
          end_key: string
          folder: string
          id: string
          luma_error: string | null
          luma_job_id: string | null
          luma_status: string | null
          ordinal: number | null
          project_id: string | null
          shot_type_id: string
          signed_url_expires_at: string | null
          start_frame_signed_url: string | null
          start_key: string
          status: string | null
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          end_frame_signed_url?: string | null
          end_key: string
          folder: string
          id?: string
          luma_error?: string | null
          luma_job_id?: string | null
          luma_status?: string | null
          ordinal?: number | null
          project_id?: string | null
          shot_type_id: string
          signed_url_expires_at?: string | null
          start_frame_signed_url?: string | null
          start_key: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          end_frame_signed_url?: string | null
          end_key?: string
          folder?: string
          id?: string
          luma_error?: string | null
          luma_job_id?: string | null
          luma_status?: string | null
          ordinal?: number | null
          project_id?: string | null
          shot_type_id?: string
          signed_url_expires_at?: string | null
          start_frame_signed_url?: string | null
          start_key?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenes_shot_type_id_fkey"
            columns: ["shot_type_id"]
            isOneToOne: false
            referencedRelation: "shot_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_types: {
        Row: {
          created_at: string | null
          hotkey: string
          id: string
          name: string
          owner_id: string
          prompt_template: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hotkey: string
          id?: string
          name: string
          owner_id: string
          prompt_template: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hotkey?: string
          id?: string
          name?: string
          owner_id?: string
          prompt_template?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_signed_urls_expired: {
        Args: { expires_at: string }
        Returns: boolean
      }
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      next_scene_ordinal: {
        Args: { p_project_id: string }
        Returns: number
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
