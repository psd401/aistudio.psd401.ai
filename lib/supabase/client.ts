import { createClient } from '@supabase/supabase-js';

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// Client with anonymous key for client-side usage
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Client with service role key for server-side operations
// IMPORTANT: This should only be used in server context
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Helper function to determine if we're in server or client context
export function getSupabaseClient(useAdmin = false) {
  return useAdmin ? supabaseAdmin : supabaseClient;
} 