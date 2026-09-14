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
      alpha_decisions: {
        Row: {
          currency: string | null
          decided_at: string
          edge: number | null
          features: Json | null
          id: string
          lag_ms: number | null
          market_id: string
          market_prob: number | null
          model_prob: number | null
          outcome_id: string | null
          price_or_odds: number | null
          rationale: string
          reject_reason: string | null
          run_id: string | null
          side: string
          slippage_bps: number | null
          source_id: string | null
          stake: number | null
          status: string
          strategy_id: string
          user_id: string
          venue: string
        }
        Insert: {
          currency?: string | null
          decided_at?: string
          edge?: number | null
          features?: Json | null
          id?: string
          lag_ms?: number | null
          market_id: string
          market_prob?: number | null
          model_prob?: number | null
          outcome_id?: string | null
          price_or_odds?: number | null
          rationale: string
          reject_reason?: string | null
          run_id?: string | null
          side: string
          slippage_bps?: number | null
          source_id?: string | null
          stake?: number | null
          status: string
          strategy_id: string
          user_id: string
          venue: string
        }
        Update: {
          currency?: string | null
          decided_at?: string
          edge?: number | null
          features?: Json | null
          id?: string
          lag_ms?: number | null
          market_id?: string
          market_prob?: number | null
          model_prob?: number | null
          outcome_id?: string | null
          price_or_odds?: number | null
          rationale?: string
          reject_reason?: string | null
          run_id?: string | null
          side?: string
          slippage_bps?: number | null
          source_id?: string | null
          stake?: number | null
          status?: string
          strategy_id?: string
          user_id?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "alpha_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_decisions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "alpha_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_decisions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "alpha_copy_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_copy_sources: {
        Row: {
          dropped_at: string | null
          first_seen: string
          followed_since: string | null
          id: string
          label: string | null
          metrics: Json
          score: number | null
          source_ref: string
          status: string
          user_id: string
          venue: string
        }
        Insert: {
          dropped_at?: string | null
          first_seen?: string
          followed_since?: string | null
          id?: string
          label?: string | null
          metrics?: Json
          score?: number | null
          source_ref: string
          status?: string
          user_id: string
          venue: string
        }
        Update: {
          dropped_at?: string | null
          first_seen?: string
          followed_since?: string | null
          id?: string
          label?: string | null
          metrics?: Json
          score?: number | null
          source_ref?: string
          status?: string
          user_id?: string
          venue?: string
        }
        Relationships: []
      }
      alpha_source_fills: {
        Row: {
          detected_at: string
          features: Json | null
          filled_at: string
          id: string
          market_id: string
          outcome_id: string | null
          price: number
          side: string
          size: number
          source_id: string
          venue_trade_id: string
        }
        Insert: {
          detected_at?: string
          features?: Json | null
          filled_at: string
          id?: string
          market_id: string
          outcome_id?: string | null
          price: number
          side: string
          size: number
          source_id: string
          venue_trade_id: string
        }
        Update: {
          detected_at?: string
          features?: Json | null
          filled_at?: string
          id?: string
          market_id?: string
          outcome_id?: string | null
          price?: number
          side?: string
          size?: number
          source_id?: string
          venue_trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_source_fills_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "alpha_copy_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_events: {
        Row: {
          acknowledged: boolean
          created_at: string
          id: string
          kind: string
          payload: Json
          strategy_id: string | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          strategy_id?: string | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          strategy_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "alpha_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_fixtures: {
        Row: {
          away_goals: number | null
          away_team: string
          away_team_id: string
          home_goals: number | null
          home_team: string
          home_team_id: string
          id: string
          injuries: Json | null
          kickoff_at: string
          league_id: string
          lineups: Json | null
          referee: string | null
          season: number
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_goals?: number | null
          away_team: string
          away_team_id: string
          home_goals?: number | null
          home_team: string
          home_team_id: string
          id: string
          injuries?: Json | null
          kickoff_at: string
          league_id: string
          lineups?: Json | null
          referee?: string | null
          season: number
          status: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_goals?: number | null
          away_team?: string
          away_team_id?: string
          home_goals?: number | null
          home_team?: string
          home_team_id?: string
          id?: string
          injuries?: Json | null
          kickoff_at?: string
          league_id?: string
          lineups?: Json | null
          referee?: string | null
          season?: number
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      alpha_ledger: {
        Row: {
          balance: number
          currency: string
          updated_at: string
          user_id: string
          venue: string
        }
        Insert: {
          balance?: number
          currency: string
          updated_at?: string
          user_id: string
          venue: string
        }
        Update: {
          balance?: number
          currency?: string
          updated_at?: string
          user_id?: string
          venue?: string
        }
        Relationships: []
      }
      alpha_market_links: {
        Row: {
          canonical: string
          confirmed: boolean
          created_at: string
          id: string
          market_id: string
          venue: string
        }
        Insert: {
          canonical: string
          confirmed?: boolean
          created_at?: string
          id?: string
          market_id: string
          venue: string
        }
        Update: {
          canonical?: string
          confirmed?: boolean
          created_at?: string
          id?: string
          market_id?: string
          venue?: string
        }
        Relationships: []
      }
      alpha_odds_snapshots: {
        Row: {
          book: string
          decimal_odds: number
          fixture_id: string
          market: string
          outcome: string
          ts: string
        }
        Insert: {
          book: string
          decimal_odds: number
          fixture_id: string
          market: string
          outcome: string
          ts?: string
        }
        Update: {
          book?: string
          decimal_odds?: number
          fixture_id?: string
          market?: string
          outcome?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "alpha_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_orders: {
        Row: {
          book: string | null
          closing_price_or_odds: number | null
          currency: string
          decision_id: string
          id: string
          kind: string
          legs: Json | null
          market_id: string
          outcome: string | null
          outcome_id: string | null
          placed_at: string
          pnl: number | null
          price_or_odds: number
          settled_at: string | null
          side: string
          stake: number
          status: string
          user_id: string
          venue: string
          venue_order_id: string
        }
        Insert: {
          book?: string | null
          closing_price_or_odds?: number | null
          currency: string
          decision_id: string
          id?: string
          kind: string
          legs?: Json | null
          market_id: string
          outcome?: string | null
          outcome_id?: string | null
          placed_at?: string
          pnl?: number | null
          price_or_odds: number
          settled_at?: string | null
          side: string
          stake: number
          status: string
          user_id: string
          venue: string
          venue_order_id: string
        }
        Update: {
          book?: string | null
          closing_price_or_odds?: number | null
          currency?: string
          decision_id?: string
          id?: string
          kind?: string
          legs?: Json | null
          market_id?: string
          outcome?: string | null
          outcome_id?: string | null
          placed_at?: string
          pnl?: number | null
          price_or_odds?: number
          settled_at?: string | null
          side?: string
          stake?: number
          status?: string
          user_id?: string
          venue?: string
          venue_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_orders_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "alpha_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_rate_budget: {
        Row: {
          limit_per_window: number
          provider: string
          used: number
          window_seconds: number
          window_start: string
        }
        Insert: {
          limit_per_window: number
          provider: string
          used?: number
          window_seconds: number
          window_start: string
        }
        Update: {
          limit_per_window?: number
          provider?: string
          used?: number
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      alpha_runs: {
        Row: {
          accepted: number
          error: string | null
          finished_at: string | null
          id: string
          intents: number
          log: Json
          rejected: number
          started_at: string
          strategy_id: string
          trigger: string
        }
        Insert: {
          accepted?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          intents?: number
          log?: Json
          rejected?: number
          started_at?: string
          strategy_id: string
          trigger: string
        }
        Update: {
          accepted?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          intents?: number
          log?: Json
          rejected?: number
          started_at?: string
          strategy_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "alpha_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_settings: {
        Row: {
          base_currency: string
          kill_switch: boolean
          leagues: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          kill_switch?: boolean
          leagues?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          kill_switch?: boolean
          leagues?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alpha_strategies: {
        Row: {
          budget: number
          budget_floor: number
          cooldown_min: number
          created_at: string
          daily_cap: number
          daily_loss_stop: number
          enabled: boolean
          id: string
          kelly_fraction: number
          last_run_at: string | null
          max_odds: number | null
          max_stake: number
          min_edge: number
          name: string
          next_run_at: string
          params: Json
          paused_reason: string | null
          schedule: Json
          strategy_key: string
          user_id: string
          venue: string
        }
        Insert: {
          budget: number
          budget_floor?: number
          cooldown_min?: number
          created_at?: string
          daily_cap: number
          daily_loss_stop: number
          enabled?: boolean
          id: string
          kelly_fraction?: number
          last_run_at?: string | null
          max_odds?: number | null
          max_stake: number
          min_edge?: number
          name: string
          next_run_at?: string
          params?: Json
          paused_reason?: string | null
          schedule: Json
          strategy_key: string
          user_id: string
          venue: string
        }
        Update: {
          budget?: number
          budget_floor?: number
          cooldown_min?: number
          created_at?: string
          daily_cap?: number
          daily_loss_stop?: number
          enabled?: boolean
          id?: string
          kelly_fraction?: number
          last_run_at?: string | null
          max_odds?: number | null
          max_stake?: number
          min_edge?: number
          name?: string
          next_run_at?: string
          params?: Json
          paused_reason?: string | null
          schedule?: Json
          strategy_key?: string
          user_id?: string
          venue?: string
        }
        Relationships: []
      }
      alpha_strategy_stats: {
        Row: {
          brier: number | null
          budget_after: number | null
          clv: number | null
          day: string
          hit_rate: number | null
          max_drawdown: number | null
          n: number
          pnl_today: number
          pnl_total: number
          roi: number | null
          roi_ci_high: number | null
          roi_ci_low: number | null
          rps: number | null
          sharpe: number | null
          strategy_id: string
        }
        Insert: {
          brier?: number | null
          budget_after?: number | null
          clv?: number | null
          day: string
          hit_rate?: number | null
          max_drawdown?: number | null
          n: number
          pnl_today?: number
          pnl_total?: number
          roi?: number | null
          roi_ci_high?: number | null
          roi_ci_low?: number | null
          rps?: number | null
          sharpe?: number | null
          strategy_id: string
        }
        Update: {
          brier?: number | null
          budget_after?: number | null
          clv?: number | null
          day?: string
          hit_rate?: number | null
          max_drawdown?: number | null
          n?: number
          pnl_today?: number
          pnl_total?: number
          roi?: number | null
          roi_ci_high?: number | null
          roi_ci_low?: number | null
          rps?: number | null
          sharpe?: number | null
          strategy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_strategy_stats_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "alpha_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_team_ratings: {
        Row: {
          as_of: string
          attack: number | null
          defence: number | null
          elo: number | null
          form_l10: number | null
          form_l5: number | null
          team_id: string
          xg_against_l5: number | null
          xg_for_l5: number | null
        }
        Insert: {
          as_of: string
          attack?: number | null
          defence?: number | null
          elo?: number | null
          form_l10?: number | null
          form_l5?: number | null
          team_id: string
          xg_against_l5?: number | null
          xg_for_l5?: number | null
        }
        Update: {
          as_of?: string
          attack?: number | null
          defence?: number | null
          elo?: number | null
          form_l10?: number | null
          form_l5?: number | null
          team_id?: string
          xg_against_l5?: number | null
          xg_for_l5?: number | null
        }
        Relationships: []
      }
      alpha_venues: {
        Row: {
          currency: string
          daily_cap: number
          daily_loss_stop: number
          day_reset_at: string
          enabled: boolean
          max_stake: number
          mode: string
          pnl_today: number
          spent_today: number
          user_id: string
          venue: string
        }
        Insert: {
          currency: string
          daily_cap: number
          daily_loss_stop: number
          day_reset_at?: string
          enabled?: boolean
          max_stake: number
          mode?: string
          pnl_today?: number
          spent_today?: number
          user_id: string
          venue: string
        }
        Update: {
          currency?: string
          daily_cap?: number
          daily_loss_stop?: number
          day_reset_at?: string
          enabled?: boolean
          max_stake?: number
          mode?: string
          pnl_today?: number
          spent_today?: number
          user_id?: string
          venue?: string
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
          scopes: string[] | null
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
          scopes?: string[] | null
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
          scopes?: string[] | null
          user_id?: string
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
      downsample_price_history: { Args: never; Returns: undefined }
      // Hand-augmented (not yet regenerated) — see
      // supabase/migrations/20260914010000_alpha_vault_secrets.sql. Not yet
      // applied to the linked project (docs/alpha/STATUS.md), so this is
      // the pre-generation convention Phase 0 also used for new tables.
      alpha_store_secret: { Args: { name: string; secret: string }; Returns: string }
      alpha_read_secret: { Args: { secret_id: string }; Returns: string | null }
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
