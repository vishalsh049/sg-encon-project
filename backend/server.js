const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Resolve env file based on NODE_ENV with sensible fallbacks
function resolveEnvFile() {
  const env = process.env.NODE_ENV;
  const candidates = [
    env === "production" && ".env.production",
    env === "development" && ".env.development",
    ".env",
  ].filter(Boolean);

  for (const file of candidates) {
    const full = path.join(__dirname, file);
    if (fs.existsSync(full)) {
      return full;
    }
  }

  // fallback so dotenv still runs (will read process env)
  return undefined;
}

const envPath = resolveEnvFile();
dotenv.config({
  path: envPath,
});
console.log("Using ENV file:", envPath || "(process env only)");

const express = require("express");
const cors = require("cors");
const { authMiddleware } = require("./middleware/circleAccess");

require("./config/db");

const app = express();

function registerRoute(routePath, mountPath) {
  // Resolve to an absolute path and tolerate missing ".js" extension
  const basePath = path.join(__dirname, routePath);
  const filePath = fs.existsSync(basePath) ? basePath : `${basePath}.js`;

  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing route file: ${routePath}`);
    return;
  }

  console.log(`Registering route: ${mountPath} -> ${filePath}`);
  app.use(mountPath, require(filePath));
}

// ✅ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ BODY PARSER
app.use(express.json());

// ✅ Serve uploads folder (direct access if needed)
app.use("/uploads", authMiddleware, (_req, res) => {
  res.status(403).json({
    message: "Direct upload file access is disabled. Use the filtered download APIs.",
  });
});

// ✅ ALL ROUTES
registerRoute("./routes/authRoutes", "/api/auth");
// Google Form webhook uses a shared-secret key (Apps Script cannot obtain a JWT),
// so it must be mounted before the global auth middleware.
registerRoute("./routes/trainingWebhookRoutes", "/api/training-webhook");
app.use("/api", authMiddleware);
registerRoute("./routes/dashboardRoutes", "/api/dashboard");
registerRoute("./routes/siteRoutes", "/api/sites");
registerRoute("./routes/manpowerRoutes", "/api/manpower");
registerRoute("./routes/physicalRoutes", "/api/physical");
registerRoute("./routes/hrDashboard", "/api/physical");
registerRoute("./routes/hrDashboardExport", "/api/hr-dashboard");
registerRoute("./routes/uptimeRoutes", "/api/site-uptime");
registerRoute("./routes/reportRoutes", "/api/reports");
registerRoute("./routes/accessRoutes", "/api/access");
registerRoute("./routes/signoff", "/api/signoff");
registerRoute("./routes/nsoRoutes", "/api/nso"); 
registerRoute("./routes/nsoDashboardRoutes", "/api/nso/dashboard");
registerRoute("./routes/fiberRoutes", "/api/fiber");
registerRoute("./routes/revenue", "/api/revenue");
registerRoute("./routes/kpidashboard", "/api");
registerRoute("./routes/meRoute", "/api");
registerRoute("./routes/billingStatus", "/api");
registerRoute("./routes/billingDashboard", "/api/billing");
registerRoute("./routes/newJoiningRoutes", "/api/new-joining");
registerRoute("./routes/designationsRoutes", "/api/designations");
registerRoute("./routes/trainingRoutes", "/api/training");
registerRoute("./routes/trainingDocumentRoutes", "/api/training-documents");
registerRoute("./routes/trainingVerificationRoutes", "/api/training-verifications");

// Test Route
app.get("/api", (req, res) => {
  res.send("API running ✅");
});

// Serve frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// ✅ FINAL SAFE FIX (no wildcard crash)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Debug: list registered routes
  const routerStack = app._router?.stack || [];
  const routes = [];
  routerStack.forEach((middleware) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods)
        .map((m) => m.toUpperCase())
        .join(",");
      routes.push(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === "router" && middleware.handle.stack) {
      middleware.handle.stack.forEach((handler) => {
        const route = handler.route;
        if (route) {
          const methods = Object.keys(route.methods)
            .map((m) => m.toUpperCase())
            .join(",");
          routes.push(`${methods} ${middleware.regexp} -> ${route.path}`);
        }
      });
    }
  });
  console.log("Registered endpoints:", routes);
});
