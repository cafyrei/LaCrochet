import { API_BASE_URL } from "./config";

async function readError(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON; use the message below.
  }
  return "Yarnie couldn't answer just now. Please try again.";
}

// Is the chat helper switched on? Resolves with { enabled, limit_per_hour }.
export async function getChatInfo(token) {
  const response = await fetch(`${API_BASE_URL}/api/chat/info`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

// Send the conversation so far. Resolves with { reply, remaining }.
// messages: [{ role: "user" | "model", text }]
export async function sendChat(messages, token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your connection and try again.");
  }
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
