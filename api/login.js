const crypto = require("crypto");
const { makeToken } = require("../lib/shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const password = (req.body && req.body.password) || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || password.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected))) {
    return res.status(401).json({ error: "invalid password" });
  }
  return res.status(200).json({ token: makeToken() });
};
