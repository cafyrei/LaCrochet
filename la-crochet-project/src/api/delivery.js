import { API_BASE_URL } from "./config";

async function readError(response, fallback) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON; use the fallback message.
  }
  return fallback;
}

// Is Lalamove set up, and where is the shop? { lalamove, flat_fee, shop: {lat, lng} }
export async function getDeliveryInfo() {
  const response = await fetch(`${API_BASE_URL}/api/delivery/info`);
  if (!response.ok) throw new Error("Could not load delivery options.");
  return response.json();
}

// What a Lalamove rider costs to this pin right now: { fee, distance_km }
export async function getDeliveryQuote(token, pin, address) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/delivery/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pin, address }),
    });
  } catch {
    throw new Error("Could not reach the server to check the delivery fee.");
  }
  if (!response.ok) throw new Error(await readError(response, "Could not get a delivery fee for that spot."));
  return response.json();
}
