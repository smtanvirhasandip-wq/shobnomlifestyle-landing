const crypto = require("crypto");

function makeToken() {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "")
    .update("admin-session")
    .digest("hex");
}

function isAuthed(req) {
  const h = req.headers.authorization || "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  const expected = makeToken();
  if (!process.env.SESSION_SECRET || !given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "shobnom-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function ghRepo() {
  return process.env.GITHUB_REPO; // e.g. "username/shobnom-landing"
}

function branch() {
  return process.env.GITHUB_BRANCH || "main";
}

module.exports = { makeToken, isAuthed, ghHeaders, ghRepo, branch };
