export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String(body.message)
        : "Request failed.";
    throw new Error(message);
  }
  return (await response.json()) as T;
}
