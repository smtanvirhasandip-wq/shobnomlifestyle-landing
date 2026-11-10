const { isAuthed, ghHeaders, ghRepo, branch } = require("../lib/shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!isAuthed(req)) return res.status(401).json({ error: "login dorkar" });

  const config = req.body && req.body.config;
  if (!config || typeof config !== "object" || !config.product || !config.theme || !config.images) {
    return res.status(400).json({ error: "invalid config" });
  }

  const url = `https://api.github.com/repos/${ghRepo()}/contents/config.json`;
  const headers = ghHeaders();

  // current file sha (needed to update an existing file)
  let sha;
  const cur = await fetch(`${url}?ref=${branch()}`, { headers });
  if (cur.ok) sha = (await cur.json()).sha;
  else if (cur.status !== 404) return res.status(502).json({ error: "GitHub read failed" });

  const body = {
    message: "Admin: update site content",
    content: Buffer.from(JSON.stringify(config, null, 2), "utf8").toString("base64"),
    branch: branch(),
  };
  if (sha) body.sha = sha;

  const put = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!put.ok) {
    const detail = await put.text();
    return res.status(502).json({ error: "GitHub save failed", detail });
  }
  return res.status(200).json({ ok: true });
};
