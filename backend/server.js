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
dotenv.config(envPath ? { path: envPath } : undefined);
console.log("Using ENV file:", envPath || "(process env only)");

const express = require("express");
const cors = require("cors");

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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ ALL ROUTES
registerRoute("./routes/authRoutes", "/api/auth");
registerRoute("./routes/dashboardRoutes", "/api/dashboard");
registerRoute("./routes/siteRoutes", "/api/sites");
registerRoute("./routes/manpowerRoutes", "/api/manpower");
registerRoute("./routes/uptimeRoutes", "/api/site-uptime");
registerRoute("./routes/reportRoutes", "/api/reports");
registerRoute("./routes/accessRoutes", "/api/access");
registerRoute("./routes/nsoRoutes", "/api/nso"); 
registerRoute("./routes/fiberRoutes", "/api/fiber");

// Test Route
app.get("/", (req, res) => {
  res.send("API Running...");
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
