/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GALLERY_STORE?: 'memory' | 'indexeddb' | 'supabase';
  readonly VITE_SYNC_BACKEND?: 'memory' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
