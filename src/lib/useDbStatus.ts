"use client";

import useSWR from "swr";
import { isDbReady } from "./sqlite";

export type DbStatus = "loading" | "ready" | "error";

export function useDbStatus(): DbStatus {
  const { data, error, isLoading } = useSWR("db-ready", isDbReady);
  if (error) return "error";
  if (isLoading || !data) return "loading";
  return "ready";
}
