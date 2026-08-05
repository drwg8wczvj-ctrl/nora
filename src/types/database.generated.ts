// Checked-in Supabase type snapshot. Regenerate with `npm run db:types` after
// schema migrations. JSON-heavy legacy columns remain Json until their Phase 2
// normalized tables replace them.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      planner_tasks: Table<{
        user_id: string;
        id: string;
        title: string;
        task_date: string | null;
        task_type: "task" | "deadline" | "break";
        start_hour: number | null;
        start_minute: number | null;
        duration_minutes: number | null;
        completed: boolean;
        complexity: "easy" | "medium" | "hard" | null;
        repeat_rule: "daily" | "weekly" | "monthly" | null;
        repeat_end: string | null;
        notes: string;
        group_id: string | null;
        reminder_offset: number | null;
        reminder_disabled: boolean;
        shared_object_id: string | null;
        extra: Json;
        revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>;
      user_app_data: Table<{
        user_id: string;
        tasks: Json | null;
        groups: Json | null;
        notes: Json | null;
        preferences: Json | null;
      }>;
      user_preferences: Table<{
        user_id: string;
        preferences: Json;
        updated_at: string | null;
      }>;
      user_profile: Table<{
        id: string;
        user_id: string;
        name: string | null;
        birthday: string | null;
        username: string | null;
        avatar_color: string | null;
        avatar_type: string | null;
        avatar_emoji: string | null;
        avatar_url: string | null;
        bio: string | null;
        location: string | null;
        timezone: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>;
      conversations: Table<{
        id: string;
        user_id: string;
        tool_key: string;
        title: string;
        pinned: boolean;
        archived: boolean;
        last_message_at: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>;
      conversation_messages: Table<{
        id: string;
        conversation_id: string;
        user_id: string;
        role: "user" | "assistant";
        parts: Json;
        created_at: string | null;
      }>;
      nora_connected_accounts: Table<{
        id: string;
        user_id: string;
        provider: string;
        display_name: string | null;
        account_email: string | null;
        is_active: boolean | null;
        last_sync_at: string | null;
        telegram_chat_id: string | null;
      }>;
      nora_suggestions: Table<{
        id: string;
        user_id: string;
        source_type: string;
        source_account_id: string | null;
        source_id: string | null;
        raw_excerpt: string | null;
        sender_name: string | null;
        ai_summary: string;
        suggestion_type: string;
        title: string;
        description: string | null;
        date: string | null;
        time: string | null;
        end_time: string | null;
        location: string | null;
        urgency: string | null;
        confidence: number | null;
        extra: Json | null;
        status: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>;
      shared_objects: Table<{
        id: string;
        owner_id: string;
        type: string;
        data: Json;
        created_at: string;
        updated_at: string;
      }>;
      object_collaborators: Table<{
        id: string;
        object_id: string;
        user_id: string;
        role: string;
        invited_by: string | null;
        joined_at: string;
      }>;
      object_comments: Table<{
        id: string;
        object_id: string;
        author_id: string;
        content: string;
        created_at: string;
      }>;
      object_activity_log: Table<{
        id: string;
        object_id: string;
        actor_id: string;
        action: string;
        details: Json | null;
        created_at: string;
      }>;
      object_invites: Table<{
        id: string;
        object_id: string;
        created_by: string;
        code: string;
        role: string;
        uses: number;
        max_uses: number | null;
        expires_at: string | null;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      consume_api_rate_limit: {
        Args: {
          p_user_id: string;
          p_bucket: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: {
          allowed: boolean;
          remaining: number;
          reset_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
