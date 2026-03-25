require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

require("./config/db");

const app = express();

function registerRoute(routePath, mountPath) {
  const filePath = path.join(__dirname, routePath);

  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing route file: ${routePath}`);
    return;
  }

  app.use(mountPath, require(routePath));
}

// ✅ FIXED CORS
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ BODY PARSER
app.use(express.json());

// ✅ ALL ROUTES
registerRoute("./routes/authRoutes", "/api/auth");
registerRoute("./routes/dashboardRoutes", "/api/dashboard");
registerRoute("./routes/siteRoutes", "/api/sites");
registerRoute("./routes/manpowerRoutes", "/api/manpower");
registerRoute("./routes/uptimeRoutes", "/api/site-uptime");

// Test Route
app.get("/", (req, res) => {
  res.send("API Running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
