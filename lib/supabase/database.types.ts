export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      search_profiles: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          is_active: boolean;
          is_archived: boolean;
          version: number;
          purchase_price_target: number | null;
          purchase_price_max: number | null;
          renovation_budget_target: number | null;
          renovation_budget_max: number | null;
          total_project_budget_target: number | null;
          total_project_budget_max: number | null;
          commute_anchor_label: string | null;
          commute_anchor_lat: number | null;
          commute_anchor_lng: number | null;
          commute_ideal_minutes: number | null;
          commute_preferred_minutes: number | null;
          commute_max_minutes: number | null;
          acreage_min: number | null;
          acreage_is_hard_min: boolean;
          renovation_tolerance: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          is_active?: boolean;
          is_archived?: boolean;
          version?: number;
          purchase_price_target?: number | null;
          purchase_price_max?: number | null;
          renovation_budget_target?: number | null;
          renovation_budget_max?: number | null;
          total_project_budget_target?: number | null;
          total_project_budget_max?: number | null;
          commute_anchor_label?: string | null;
          commute_anchor_lat?: number | null;
          commute_anchor_lng?: number | null;
          commute_ideal_minutes?: number | null;
          commute_preferred_minutes?: number | null;
          commute_max_minutes?: number | null;
          acreage_min?: number | null;
          acreage_is_hard_min?: boolean;
          renovation_tolerance?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_profiles"]["Insert"]>;
      };
      profile_town_preferences: {
        Row: {
          id: string;
          profile_id: string;
          town: string;
          state: string;
          rank: number;
          tier: number;
          weight: number;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profile_town_preferences"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["profile_town_preferences"]["Insert"]
        >;
      };
      profile_feature_preferences: {
        Row: {
          id: string;
          profile_id: string;
          feature_key: string;
          feature_label: string;
          category: string;
          rank: number | null;
          weight: number;
          mode: "bonus" | "penalty" | "hard_reject" | "neutral";
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profile_feature_preferences"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["profile_feature_preferences"]["Insert"]
        >;
      };
      profile_category_weights: {
        Row: {
          id: string;
          profile_id: string;
          category_key: string;
          category_label: string;
          weight: number;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profile_category_weights"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["profile_category_weights"]["Insert"]
        >;
      };
      profile_score_thresholds: {
        Row: {
          id: string;
          profile_id: string;
          label: string;
          minimum_score: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profile_score_thresholds"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["profile_score_thresholds"]["Insert"]
        >;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      profile_preference_mode: "bonus" | "penalty" | "hard_reject" | "neutral";
    };
    CompositeTypes: Record<string, never>;
  };
};
