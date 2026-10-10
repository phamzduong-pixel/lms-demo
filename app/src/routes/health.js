const express = require("express");
const pool = require("../db");
const healthQueries = require("../queries/healthQueries");

const router = express.Router();

router.get("/health", async (req, res) => {
  try {
    await healthQueries.check(pool);
    res.json({ app: "ok", database: "ok" });
  } catch (error) {
    console.error("Không kết nối được MySQL:", error.message);
    res.status(503).json({ app: "ok", database: "unavailable" });
  }
});

module.exports = router;