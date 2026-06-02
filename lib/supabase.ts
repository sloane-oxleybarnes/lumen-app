import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  plan: "free" | "pro" | "team" | "beta";
  role: "member" | "admin";
  team_id: string | null;
  team_opt_in: boolean;
  hubspot_contact_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  name: string;
  plan: string;
  seat_count: number;
  admin_id: string;
  stripe_subscription_id: string | null;
  hubspot_deal_id: string | null;
  created_at: string;
};

export type BetaSignup = {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  plan: string;
  hubspot_contact_id: string | null;
  converted_to_user: boolean;
  created_at: string;
};
