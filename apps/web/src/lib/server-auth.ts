import { cookies } from "next/headers";

export const SESSION_COOKIE = "hanmir_token";

export function getServerToken(): string | undefined {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return value && value.trim() ? value : undefined;
}
