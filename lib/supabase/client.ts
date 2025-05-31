import { createClient } from '@supabase/supabase-js';
import logger from "@/lib/logger"

// Validate required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  logger.error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
  throw new Error('Supabase URL is required');
}

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseAnonKey) {
  logger.error('SUPABASE_ANON_KEY environment variable is not set');
  throw new Error('Supabase anonymous key is required');
}

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  logger.error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  throw new Error('Supabase service role key is required');
}

// Client with anonymous key for client-side usage
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Client with service role key for server-side operations
// IMPORTANT: This should only be used in server context
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Helper function to determine if we're in server or client context
export function getSupabaseClient(useAdmin = false) {
  return useAdmin ? supabaseAdmin : supabaseClient;
} 