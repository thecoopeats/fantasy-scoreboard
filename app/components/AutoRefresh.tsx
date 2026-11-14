"use client";

import { useRouter } from "next/navigation";
import { useAutoRefresh } from "./useAutoRefresh";

// Re-fetches the server-rendered page every `seconds` while it is visible, and when it is reopened.
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), seconds);
  return null;
}
