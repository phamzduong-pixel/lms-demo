require("dotenv").config();

const express = require("express");
const pool = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("LMS Demo đang chạy");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ app: "ok", database: "ok" });
  } catch (error) {
    console.error("Không kết nối được MySQL:", error.message);
    res.status(503).json({ app: "ok", database: "unavailable" });
  }
});

app.listen(port, () => {
  console.log(`LMS Demo đang nghe tại cổng ${port}`);
});
