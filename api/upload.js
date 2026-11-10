const { isAuthed, ghHeaders, ghRepo, branch } = require("../lib/shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!isAuthed(req)) return res.status(401).json({ error: "login dorkar" });

  const { path, content, message } = req.body || {};
  // only allow files inside images/ with safe names
  if (typeof path !== "string" || !/^images\/[a-z0-9_-]+(-\d+)?\.(webp|png|jpg|jpeg)$/i.test(path)) {
    return res.status(400).json({ error: "invalid path" });
  }
  if (typeof content !== "string" || content.length < 10) {
    return res.status(400).json({ error: "empty image" });
  }

  const url = `https://api.github.com/repos/${ghRepo()}/contents/${path}`;
  const headers = ghHeaders();
  const body = {
    message: message || "Admin: upload image",
    content,
    branch: branch(),
  };
  const cur = await fetch(`${url}?ref=${branch()}`, { headers });
  if (cur.ok) body.sha = (await cur.json()).sha;

  const put = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!put.ok) {
    const detail = await put.text();
    return res.status(502).json({ error: "GitHub upload failed", detail });
  }
  return res.status(200).json({ ok: true, path });
};
