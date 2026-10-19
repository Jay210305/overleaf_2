import { parsePublicConfig } from "@latex-collab/config";

const config = parsePublicConfig(import.meta.env);
const apiUrl = config.VITE_API_URL;

export function setupApiClient() {
  if (typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.startsWith(apiUrl)) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );

      const credentials = init?.credentials ?? "include";

      try {
        const sessionToken = sessionStorage.getItem("session_token");
        if (sessionToken && !headers.has("x-session-token")) {
          headers.set("x-session-token", sessionToken);
        }
        const csrfToken = sessionStorage.getItem("csrf_token");
        const method = (
          init?.method ?? (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        if (
          csrfToken &&
          !headers.has("x-csrf-token") &&
          !["GET", "HEAD", "OPTIONS"].includes(method)
        ) {
          headers.set("x-csrf-token", csrfToken);
        }
      } catch {}

      init = {
        ...init,
        credentials,
        headers,
      };
    }

    const response = await originalFetch(input, init);

    if (urlStr.startsWith(apiUrl)) {
      try {
        const newSession = response.headers.get("x-session-token");
        if (newSession) {
          sessionStorage.setItem("session_token", newSession);
        }
        const newCsrf = response.headers.get("x-csrf-token");
        if (newCsrf) {
          sessionStorage.setItem("csrf_token", newCsrf);
        }
        if (
          response.status === 401 &&
          !urlStr.includes("/auth/login") &&
          !urlStr.includes("/auth/register")
        ) {
          sessionStorage.removeItem("session_token");
          sessionStorage.removeItem("current_user");
          window.dispatchEvent(new Event("auth-state-change"));
        }
      } catch {}
    }

    return response;
  };
}
