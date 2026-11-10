// Server-side Meta Conversions API. Sends the same events as the browser Pixel,
// with the same event_id, so Meta counts each conversion once and matches it better.
const crypto = require("crypto");

const ALLOWED = ["ViewContent", "InitiateCheckout", "Purchase", "Lead"];

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
  if (b.user_data && b.user_data.ph) userData.ph = [sha256(normPhone(b.user_data.ph))];
  if (b.user_data && b.user_data.fn) userData.fn = [sha256(b.user_data.fn)];

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
