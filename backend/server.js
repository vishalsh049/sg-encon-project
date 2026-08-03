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
const compression = require("compression");
const { authMiddleware } = require("./middleware/circleAccess");

require("./config/db");

const app = express();

// Gzip/deflate every response above the default 1KB threshold — mainly
// benefits the JSON report-list/search responses; the `compressible` filter
// this library uses already skips content types (like .xlsx/.xlsb, which are
// zip archives) that wouldn't shrink further.
app.use(
  compression({
    // XLSX is already a ZIP container. Keep the completed export byte-for-byte
    // intact, including its known Content-Length.
    filter(req, res) {
      if (req.path === "/api/reports/export-excel") return false;
      return compression.filter(req, res);
    },
  })
);

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
// Set CORS_ORIGINS to a comma-separated list of allowed sites, e.g.
//   CORS_ORIGINS=https://portal.example.com,http://localhost:5173
// Left unset it stays open to every origin, which is how this app has been
// running — so the default is kept to avoid breaking a live deployment, with a
// warning instead.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length) {
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = same-origin or a non-browser client (curl, health checks).
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  console.log("CORS restricted to:", allowedOrigins.join(", "));
} else {
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  console.warn(
    "⚠️  CORS_ORIGINS is not set — the API accepts requests from any website. " +
    "Set CORS_ORIGINS to lock this down."
  );
}

/**
 * Minimal fixed-window rate limiter. Deliberately dependency-free so this needs
 * no new package on a live deployment. Counters live in memory, so with several
 * server instances each enforces its own window — enough to stop one client
 * hammering the heavy upload/export endpoints.
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();

  // Drop expired buckets so the map cannot grow without bound.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${req.authUser?.id || req.ip}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: `${message}\n\nPlease wait ${retryAfter} second(s) and try again.`,
      });
    }

    return next();
  };
}

// ✅ BODY PARSER
app.use(express.json({ limit: "1mb" }));

// Brute-force protection on sign-in, keyed by IP since there is no user yet.
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many sign-in attempts from this address.",
  })
);

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

// Report uploads and exports parse whole workbooks in memory, so they are the
// most expensive endpoints in the app. Limits are per signed-in user.
app.use(
  "/api/reports/upload",
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many uploads in a short time.",
  })
);
app.use(
  "/api/reports/export-excel",
  rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: "Too many export requests in a short time.",
  })
);

registerRoute("./routes/dashboardRoutes", "/api/dashboard");
registerRoute("./routes/siteRoutes", "/api/sites");
registerRoute("./routes/manpowerRoutes", "/api/manpower");
registerRoute("./routes/physicalRoutes", "/api/physical");
registerRoute("./routes/hrDashboard", "/api/physical");
registerRoute("./routes/hrDashboardExport", "/api/hr-dashboard");
registerRoute("./routes/scrumDashboard", "/api/scrum-dashboard");
registerRoute("./routes/uptimeRoutes", "/api/site-uptime");
registerRoute("./routes/reportRoutes", "/api/reports");
registerRoute("./routes/accessRoutes", "/api/access");
registerRoute("./routes/signoff", "/api/signoff");
registerRoute("./routes/hrAnalyticsV2Routes", "/api/hr-analytics-v2");
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
registerRoute("./routes/circlesRoutes", "/api/circles");
registerRoute("./routes/manpowerSettingsRoutes", "/api/manpower-settings");
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
