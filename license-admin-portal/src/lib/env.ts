export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "/be";
  }
  return process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
}
