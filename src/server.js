require("dotenv").config();
require("express-async-errors");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { runScheduledChecks } = require("./utils/scheduledChecks");

const app = express();

// Connect DB
connectDB();

// Date-based notification checks (upcoming audits, corrective-action due/
// overdue, expiring documents/quotations) - a simple in-process interval,
// not a durable job queue/cron (see utils/scheduledChecks.js for the
// documented limitations of this approach). Runs once shortly after
// startup, then every hour.
const SCHEDULED_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const initialCheckTimer = setTimeout(runScheduledChecks, 10000);
const scheduledCheckInterval = setInterval(runScheduledChecks, SCHEDULED_CHECK_INTERVAL_MS);

// Security
app.use(helmet());
// CORS_ORIGIN is the canonical var name; FRONTEND_URL is kept as a fallback
// for existing deployments/.env files that only set that name.
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin/non-browser requests (no Origin header)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const err = new Error("Not allowed by CORS");
    err.statusCode = 403;
    return callback(err);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: "Too many requests." });
app.use("/api/", limiter);

// Strict limit for auth
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many login attempts." });
app.use("/api/auth/login", authLimiter);

// Strict limit for the public (unauthenticated, token-based) quotation
// acceptance endpoints - defense in depth against token brute-forcing on
// top of the token's own 256 bits of entropy.
const publicQuotationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: "Too many requests. Please try again later." });
app.use("/api/public/quotations", publicQuotationLimiter);

// Parsing & logging
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/quotations", require("./routes/quotationRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/enquiries", require("./routes/enquiryRoutes"));
app.use("/api/iso-standards", require("./routes/isoStandardRoutes"));
app.use("/api/public/quotations", require("./routes/publicQuotationRoutes"));
app.use("/api/documents", require("./routes/documentRoutes"));
app.use("/api/iso-engagements", require("./routes/isoEngagementRoutes"));
app.use("/api/iso-clauses", require("./routes/isoClauseRoutes"));
app.use("/api/compliance-assessments", require("./routes/complianceAssessmentRoutes"));
app.use("/api/audits", require("./routes/auditRoutes"));
app.use("/api/audit-findings", require("./routes/auditFindingRoutes"));
app.use("/api/corrective-actions", require("./routes/correctiveActionRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

// Health check - reports DB connectivity (via mongoose.connection.readyState)
// without leaking the connection string/credentials.
app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const dbStatus = dbState === 1 ? "connected" : "disconnected";
  const status = dbState === 1 ? "ok" : "degraded";
  res.status(dbState === 1 ? 200 : 503).json({
    status, db: dbStatus, env: process.env.NODE_ENV, time: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found." }));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`));

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Graceful shutdown: stop accepting new connections, clear the scheduled-
// check timers so the process can actually exit, then close the DB
// connection before terminating. Orchestrators (Docker, PM2, k8s) send
// SIGTERM on redeploy/scale-down; SIGINT covers Ctrl+C in a dev shell.
const shutdown = (signal) => {
  logger.info(`${signal} received: shutting down gracefully.`);
  clearTimeout(initialCheckTimer);
  clearInterval(scheduledCheckInterval);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      logger.info("Shutdown complete.");
      process.exit(0);
    } catch (err) {
      logger.error(`Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  });
  // Safety net: force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
