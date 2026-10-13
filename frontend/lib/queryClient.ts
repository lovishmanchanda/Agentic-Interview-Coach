import { QueryClient } from "@tanstack/react-query";

/**
 * One cache of server data per browser tab (TanStack Query), shared by React components (useQuery) and plain
 * code (stores, sign-in, sign-out) through getQueryClient().
 *
 *   staleTime 30 s     going back to a page you just saw shows it instantly, without refetching
 *   refetch on focus   coming back to the tab after a while refreshes what's on screen
 *   retry              only server and network errors, twice, with backoff; a 4xx (not found, not yours,
 *                      validation) is an answer, not a blip
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failures, error) => {
          const status = (error as { status?: number } | null)?.status;
          return failures < 2 && (!status || status >= 500);
        },
      },
    },
  });
}

let browserClient: QueryClient | null = null;

/** The tab's client in the browser; a fresh one on the server, so requests never share a cache. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}
