const SUPABASE_URL = 'https://nslqoidosdfyjdojvrqa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_u1fPXVH-4ildRoNizzi4sQ_OXGWTdpB';
// Capture BEFORE createClient() clears the hash
window._isRecoveryUrl = /type=recovery/i.test(location.hash);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
