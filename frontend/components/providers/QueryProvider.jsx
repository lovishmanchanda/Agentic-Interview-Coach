"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "@/lib/queryClient";

/** Makes the tab's server-data cache (lib/queryClient.js) available to every page. */
export default function QueryProvider({ children }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
