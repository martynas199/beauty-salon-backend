import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import servicesRouter from "./routes/services.js";
import beauticiansRouter from "./routes/beauticians.js";
import slotsRouter from "./routes/slots.js";
import checkoutRouter from "./routes/checkout.js";
import appointmentsRouter from "./routes/appointments.js";
import webhooksRouter from "./routes/webhooks.js";
import salonRouter from "./routes/salon.js";
import settingsRouter from "./routes/settings.js";
import revenueRouter from "./routes/revenue.js";
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing");
  process.exit(1);
}
await mongoose.connect(MONGO_URI);
app.get("/health", (req, res) => res.json({ ok: true }));
// Webhooks: use raw body for Stripe signature verification BEFORE json parser
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhooksRouter
);
// JSON parser for the rest of the API
app.use(express.json());
app.use("/api/services", servicesRouter);
app.use("/api/beauticians", beauticiansRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/salon", salonRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/revenue", revenueRouter);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Unknown error" });
});
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
