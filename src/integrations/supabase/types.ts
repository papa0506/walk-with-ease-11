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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          default_share_mode: Database["public"]["Enums"]["share_mode"]
          id: string
          name: string
          password_hash: string
          phone: string
          public_code: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_share_mode?: Database["public"]["Enums"]["share_mode"]
          id?: string
          name: string
          password_hash: string
          phone: string
          public_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_share_mode?: Database["public"]["Enums"]["share_mode"]
          id?: string
          name?: string
          password_hash?: string
          phone?: string
          public_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      entrances: {
        Row: {
          accuracy: number | null
          code: string
          created_at: string
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          measured_at: string | null
          measured_by: string | null
          name: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          accuracy?: number | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          measured_at?: string | null
          measured_by?: string | null
          name: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          accuracy?: number | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          measured_at?: string | null
          measured_by?: string | null
          name?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entrances_measured_by_fkey"
            columns: ["measured_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hazards: {
        Row: {
          accuracy: number | null
          active: boolean
          cleared_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          reporter_type: Database["public"]["Enums"]["hazard_reporter"]
          route_meter: number | null
          side: Database["public"]["Enums"]["side_dir"]
          subtype: string | null
          type: string | null
          verification_status: Database["public"]["Enums"]["hazard_verification"]
          verified: boolean
        }
        Insert: {
          accuracy?: number | null
          active?: boolean
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          reporter_type?: Database["public"]["Enums"]["hazard_reporter"]
          route_meter?: number | null
          side?: Database["public"]["Enums"]["side_dir"]
          subtype?: string | null
          type?: string | null
          verification_status?: Database["public"]["Enums"]["hazard_verification"]
          verified?: boolean
        }
        Update: {
          accuracy?: number | null
          active?: boolean
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          reporter_type?: Database["public"]["Enums"]["hazard_reporter"]
          route_meter?: number | null
          side?: Database["public"]["Enums"]["side_dir"]
          subtype?: string | null
          type?: string | null
          verification_status?: Database["public"]["Enums"]["hazard_verification"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hazards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      landmarks: {
        Row: {
          accuracy: number | null
          announcement: string | null
          created_at: string
          created_by: string | null
          custom_name: string | null
          direction_hint: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          route_meter: number | null
          side: Database["public"]["Enums"]["side_dir"]
          survey_direction: Database["public"]["Enums"]["survey_dir"]
          type: string | null
          verified: boolean
        }
        Insert: {
          accuracy?: number | null
          announcement?: string | null
          created_at?: string
          created_by?: string | null
          custom_name?: string | null
          direction_hint?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          route_meter?: number | null
          side?: Database["public"]["Enums"]["side_dir"]
          survey_direction?: Database["public"]["Enums"]["survey_dir"]
          type?: string | null
          verified?: boolean
        }
        Update: {
          accuracy?: number | null
          announcement?: string | null
          created_at?: string
          created_by?: string | null
          custom_name?: string | null
          direction_hint?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          route_meter?: number | null
          side?: Database["public"]["Enums"]["side_dir"]
          survey_direction?: Database["public"]["Enums"]["survey_dir"]
          type?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "landmarks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          accuracy: number | null
          basis_entrance: string
          id: string
          lat: number | null
          lng: number | null
          measured_at: string
          measured_by: string | null
          meter: number
          survey_direction: Database["public"]["Enums"]["survey_dir"]
          verification_status: Database["public"]["Enums"]["milestone_verification"]
          verified: boolean
        }
        Insert: {
          accuracy?: number | null
          basis_entrance: string
          id?: string
          lat?: number | null
          lng?: number | null
          measured_at?: string
          measured_by?: string | null
          meter: number
          survey_direction?: Database["public"]["Enums"]["survey_dir"]
          verification_status?: Database["public"]["Enums"]["milestone_verification"]
          verified?: boolean
        }
        Update: {
          accuracy?: number | null
          basis_entrance?: string
          id?: string
          lat?: number | null
          lng?: number | null
          measured_at?: string
          measured_by?: string | null
          meter?: number
          survey_direction?: Database["public"]["Enums"]["survey_dir"]
          verification_status?: Database["public"]["Enums"]["milestone_verification"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "milestones_basis_entrance_fkey"
            columns: ["basis_entrance"]
            isOneToOne: false
            referencedRelation: "entrances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_measured_by_fkey"
            columns: ["measured_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      onetouch_handoffs: {
        Row: {
          created_at: string
          handoff_token: string
          id: string
          pickup_entrance_id: string | null
          return_url: string | null
          status: Database["public"]["Enums"]["handoff_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          handoff_token: string
          id?: string
          pickup_entrance_id?: string | null
          return_url?: string | null
          status?: Database["public"]["Enums"]["handoff_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          handoff_token?: string
          id?: string
          pickup_entrance_id?: string | null
          return_url?: string | null
          status?: Database["public"]["Enums"]["handoff_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onetouch_handoffs_pickup_entrance_id_fkey"
            columns: ["pickup_entrance_id"]
            isOneToOne: false
            referencedRelation: "entrances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onetouch_handoffs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      walk_sessions: {
        Row: {
          direction: Database["public"]["Enums"]["walk_direction"]
          ended_at: string | null
          id: string
          start_entrance_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["walk_status"]
          user_id: string
        }
        Insert: {
          direction?: Database["public"]["Enums"]["walk_direction"]
          ended_at?: string | null
          id?: string
          start_entrance_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["walk_status"]
          user_id: string
        }
        Update: {
          direction?: Database["public"]["Enums"]["walk_direction"]
          ended_at?: string | null
          id?: string
          start_entrance_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["walk_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walk_sessions_start_entrance_id_fkey"
            columns: ["start_entrance_id"]
            isOneToOne: false
            referencedRelation: "entrances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      handoff_status: "CREATED" | "SENT" | "DONE" | "CANCELLED"
      hazard_reporter: "ANONYMOUS" | "USER" | "ADMIN"
      hazard_verification:
        | "USER_REPORTED"
        | "ADMIN_CONFIRMED"
        | "CLEARED"
        | "EXPIRED"
      milestone_verification: "NONE" | "FIELD_MEASURED" | "VERIFIED"
      share_mode: "PRIVATE" | "FRIENDS" | "PUBLIC"
      side_dir: "LEFT" | "RIGHT" | "FRONT" | "BOTH" | "ALL" | "UNKNOWN"
      survey_dir: "THEATER_TO_CABLECAR" | "CABLECAR_TO_THEATER" | "UNSPEC"
      user_role: "USER" | "ADMIN"
      user_status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
      walk_direction: "CW" | "CCW" | "UNSPEC"
      walk_status: "ACTIVE" | "DONE" | "ABORTED"
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
    Enums: {
      handoff_status: ["CREATED", "SENT", "DONE", "CANCELLED"],
      hazard_reporter: ["ANONYMOUS", "USER", "ADMIN"],
      hazard_verification: [
        "USER_REPORTED",
        "ADMIN_CONFIRMED",
        "CLEARED",
        "EXPIRED",
      ],
      milestone_verification: ["NONE", "FIELD_MEASURED", "VERIFIED"],
      share_mode: ["PRIVATE", "FRIENDS", "PUBLIC"],
      side_dir: ["LEFT", "RIGHT", "FRONT", "BOTH", "ALL", "UNKNOWN"],
      survey_dir: ["THEATER_TO_CABLECAR", "CABLECAR_TO_THEATER", "UNSPEC"],
      user_role: ["USER", "ADMIN"],
      user_status: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      walk_direction: ["CW", "CCW", "UNSPEC"],
      walk_status: ["ACTIVE", "DONE", "ABORTED"],
    },
  },
} as const
