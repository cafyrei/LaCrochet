import { API_BASE_URL } from "./config";

async function readError(response, fallback) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      return String(body.detail[0].msg).replace(/^Value error, /, "");
    }
  } catch {
    // Not JSON; use the fallback.
  }
  return fallback;
}

// The shop's phone, email, address, hours and social pages (from backend/.env).
export async function getShopInfo() {
  const response = await fetch(`${API_BASE_URL}/api/shop/info`);
  if (!response.ok) throw new Error("Could not load the shop's details.");
  return response.json();
}

// Sends the Contact page form. Logged in? The message is linked to their account.
export async function sendContactMessage(message, token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(message),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your connection and try again.");
  }
  if (!response.ok) throw new Error(await readError(response, "Your message didn't send. Please try again."));
  return response.json();
}
