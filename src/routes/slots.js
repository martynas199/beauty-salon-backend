import { Router } from "express";
import Beautician from "../models/Beautician.js";
import Service from "../models/Service.js";
import Appointment from "../models/Appointment.js";
import { computeSlots } from "../utils/slotEngine.js";
const r = Router();
r.get("/", async (req,res)=>{
  const { beauticianId, serviceId, variantName, date, any } = req.query;
  if(!serviceId || !variantName || !date) return res.status(400).json({ error: "Missing params" });
  const service = await Service.findById(serviceId).lean(); if(!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants||[]).find(v => v.name === variantName); if(!variant) return res.status(404).json({ error: "Variant not found" });
  const salonTz = process.env.SALON_TZ || "Europe/London";
  let slots = [];
  if(any === "true"){
    const staffIds = service.beauticianIds || [];
    const staff = await Beautician.find({ _id: { $in: staffIds }, active:true }).lean();
    const apptsByStaff = await Appointment.find({ beauticianId: { $in: staffIds }, start: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 86400000) } }).lean();
    for(const b of staff){ const taken = apptsByStaff.filter(a => String(a.beauticianId) === String(b._id)); slots = slots.concat(computeSlots({ beautician: b, variant, date, appointments: taken, salonTz })); }
    const seen = new Set(); slots = slots.filter(s => (seen.has(s.startISO) ? false : (seen.add(s.startISO), true)));
  } else {
    const b = await Beautician.findById(beauticianId).lean(); if(!b) return res.status(404).json({ error: "Beautician not found" });
    const appts = await Appointment.find({ beauticianId, start: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 86400000) } }).lean();
    slots = computeSlots({ beautician: b, variant, date, appointments: appts, salonTz });
  }
  res.json({ slots });
});
export default r;
