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
    PostgrestVersion: "14.15"
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
      academy_progress: {
        Row: {
          completed_lessons: string[]
          hearts: number
          last_heart_lost_at: string | null
          last_lesson_day: string | null
          streak: number
          user_id: string
          xp: number
        }
        Insert: {
          completed_lessons?: string[]
          hearts?: number
          last_heart_lost_at?: string | null
          last_lesson_day?: string | null
          streak?: number
          user_id: string
          xp?: number
        }
        Update: {
          completed_lessons?: string[]
          hearts?: number
          last_heart_lost_at?: string | null
          last_lesson_day?: string | null
          streak?: number
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      automation_triggers: {
        Row: {
          automation_id: string
          executions_count: number
          last_evaluated_at: string | null
          last_triggered_at: string | null
          spent_today: number
          spent_today_reset_at: string
        }
        Insert: {
          automation_id: string
          executions_count?: number
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          spent_today?: number
          spent_today_reset_at?: string
        }
        Update: {
          automation_id?: string
          executions_count?: number
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          spent_today?: number
          spent_today_reset_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_triggers_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: true
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          action: Json | null
          category: string
          condition: Json | null
          condition_type: string | null
          cooldown_label: string | null
          created_at: string
          daily_cap: number
          enabled: boolean
          executions_label: string | null
          id: string
          max_order_size: number
          name: string
          rule: string
          symbol: string | null
          template_key: string
          user_id: string
        }
        Insert: {
          action?: Json | null
          category: string
          condition?: Json | null
          condition_type?: string | null
          cooldown_label?: string | null
          created_at?: string
          daily_cap: number
          enabled?: boolean
          executions_label?: string | null
          id: string
          max_order_size: number
          name: string
          rule: string
          symbol?: string | null
          template_key: string
          user_id: string
        }
        Update: {
          action?: Json | null
          category?: string
          condition?: Json | null
          condition_type?: string | null
          cooldown_label?: string | null
          created_at?: string
          daily_cap?: number
          enabled?: boolean
          executions_label?: string | null
          id?: string
          max_order_size?: number
          name?: string
          rule?: string
          symbol?: string | null
          template_key?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_stats_snapshot: {
        Row: {
          day: string
          lessons_completed: number
          pnl: number
          user_id: string
          xp: number
        }
        Insert: {
          day: string
          lessons_completed?: number
          pnl?: number
          user_id: string
          xp?: number
        }
        Update: {
          day?: string
          lessons_completed?: number
          pnl?: number
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          asset_id: string
          price: number
          ts: string
        }
        Insert: {
          asset_id: string
          price: number
          ts?: string
        }
        Update: {
          asset_id?: string
          price?: number
          ts?: string
        }
        Relationships: []
      }
      broker_credentials: {
        Row: {
          broker: string
          created_at: string
          id: string
          scope: string
          secret_ref: string
          user_id: string
        }
        Insert: {
          broker: string
          created_at?: string
          id?: string
          scope?: string
          secret_ref: string
          user_id: string
        }
        Update: {
          broker?: string
          created_at?: string
          id?: string
          scope?: string
          secret_ref?: string
          user_id?: string
        }
        Relationships: []
      }
      open_orders: {
        Row: {
          filled_pct: number
          id: string
          label: string
          limit_price: number
          market_id: string
          placed_at: string
          shares: number
          side: string
          status: string
          strike: number
          user_id: string
        }
        Insert: {
          filled_pct?: number
          id: string
          label: string
          limit_price: number
          market_id: string
          placed_at: string
          shares: number
          side: string
          status: string
          strike: number
          user_id: string
        }
        Update: {
          filled_pct?: number
          id?: string
          label?: string
          limit_price?: number
          market_id?: string
          placed_at?: string
          shares?: number
          side?: string
          status?: string
          strike?: number
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          asset_id: string | null
          avg_price: number
          cost: number | null
          id: string
          kind: string
          market_id: string | null
          opened_at: string
          qty: number
          side: string
          stop_loss: number | null
          take_profit: number | null
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          avg_price: number
          cost?: number | null
          id: string
          kind: string
          market_id?: string | null
          opened_at: string
          qty: number
          side: string
          stop_loss?: number | null
          take_profit?: number | null
          user_id: string
        }
        Update: {
          asset_id?: string | null
          avg_price?: number
          cost?: number | null
          id?: string
          kind?: string
          market_id?: string | null
          opened_at?: string
          qty?: number
          side?: string
          stop_loss?: number | null
          take_profit?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_seed: string
          best_streak: number
          claims: number
          created_at: string
          digest_opt_in: boolean
          email: string | null
          handle: string | null
          last_claim_day: string | null
          streak: number
          user_id: string
        }
        Insert: {
          avatar_seed?: string
          best_streak?: number
          claims?: number
          created_at?: string
          digest_opt_in?: boolean
          email?: string | null
          handle?: string | null
          last_claim_day?: string | null
          streak?: number
          user_id: string
        }
        Update: {
          avatar_seed?: string
          best_streak?: number
          claims?: number
          created_at?: string
          digest_opt_in?: boolean
          email?: string | null
          handle?: string | null
          last_claim_day?: string | null
          streak?: number
          user_id?: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          asset_id: string | null
          close_price: number | null
          closed_at: string
          entry_price: number
          exit_price: number
          id: string
          kind: string
          label: string | null
          market_id: string | null
          opened_at: string | null
          pnl: number
          qty: number
          result: string | null
          side: string
          strike: number | null
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          close_price?: number | null
          closed_at: string
          entry_price: number
          exit_price: number
          id: string
          kind: string
          label?: string | null
          market_id?: string | null
          opened_at?: string | null
          pnl: number
          qty: number
          result?: string | null
          side: string
          strike?: number | null
          user_id: string
        }
        Update: {
          asset_id?: string | null
          close_price?: number | null
          closed_at?: string
          entry_price?: number
          exit_price?: number
          id?: string
          kind?: string
          label?: string | null
          market_id?: string | null
          opened_at?: string | null
          pnl?: number
          qty?: number
          result?: string | null
          side?: string
          strike?: number | null
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          best_pnl: number
          cash: number
          deposit_count: number
          losses: number
          next_deposit_at: string | null
          trades_placed: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          best_pnl?: number
          cash?: number
          deposit_count?: number
          losses?: number
          next_deposit_at?: string | null
          trades_placed?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          best_pnl?: number
          cash?: number
          deposit_count?: number
          losses?: number
          next_deposit_at?: string | null
          trades_placed?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard_pnl: {
        Row: {
          cash: number | null
          handle: string | null
          losses: number | null
          trades_placed: number | null
          user_id: string | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
