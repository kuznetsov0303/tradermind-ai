import { supabase } from "@/lib/supabaseClient";

export async function clientAuthFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers || {});

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export const authFetch = clientAuthFetch;
export const fetchWithAuth = clientAuthFetch;
export const clientFetchWithAuth = clientAuthFetch;

export default clientAuthFetch;