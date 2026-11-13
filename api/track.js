// Server-side Meta Conversions API. Sends the same events as the browser Pixel,
// with the same event_id, so Meta counts each conversion once and matches it better.
const crypto = require("crypto");

const ALLOWED = ["PageView", "ViewContent", "InitiateCheckout", "Purchase", "Lead"];

const sha256 = (v) => crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex");

// 01XXXXXXXXX -> 8801XXXXXXXXX (Meta wants digits with country code)
const normPhone = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "880" + d.slice(1);
  return d;
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !token) return res.status(200).json({ skipped: true });

  const b = req.body || {};
  const name = String(b.event_name || "");
  if (!ALLOWED.includes(name)) return res.status(400).json({ error: "event not allowed" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "";
  const userData = {
    client_ip_address: ip,
    client_user_agent: String(b.user_agent || req.headers["user-agent"] || ""),
  };
  if (b.fbp) userData.fbp = String(b.fbp);
  if (b.fbc) userData.fbc = String(b.fbc);
  else {
    // fallback: rebuild click ID from the page URL if the browser did not send it
    try {
      const id = new URL(String(b.event_source_url || "")).searchParams.get("fbclid");
      if (id) userData.fbc = `fb.1.${Date.now()}.${id}`;
    } catch (e) {}
  }
  // visitor ID (same value the browser Pixel sends)
  if (typeof b.external_id === "string" && /^[A-Za-z0-9-]{16,64}$/.test(b.external_id)) userData.external_id = [b.external_id];

  // country + city from the visitor's IP (Vercel adds these headers), hashed
  const country = String(req.headers["x-vercel-ip-country"] || "").trim();
  if (/^[A-Za-z]{2}$/.test(country)) userData.country = [sha256(country)];
  let city = "";
  try { city = decodeURIComponent(String(req.headers["x-vercel-ip-city"] || "")); } catch (e) {}
  city = city.toLowerCase().replace(/[^a-z]/g, "");
  if (city) userData.ct = [sha256(city)];

  // details the customer typed in the order form (only on Lead / Purchase)
  if (b.user_data && b.user_data.ph) userData.ph = [sha256(normPhone(b.user_data.ph))];
  if (b.user_data && b.user_data.fn) {
    const parts = String(b.user_data.fn).trim().split(/\s+/).filter(Boolean);
    if (parts[0]) userData.fn = [sha256(parts[0])];                       // first name
    if (parts.length > 1) userData.ln = [sha256(parts[parts.length - 1])]; // last name
  }

  const event = {
    event_name: name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(b.event_id || ""),
    action_source: "website",
    event_source_url: String(b.event_source_url || ""),
    user_data: userData,
    custom_data: b.custom_data || {},
  };

  const body = { data: [event] };
  if (process.env.META_TEST_CODE) body.test_event_code = process.env.META_TEST_CODE;

  const r = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!r.ok) return res.status(502).json({ ok: false, detail: await r.text() });
  return res.status(200).json({ ok: true });
};
