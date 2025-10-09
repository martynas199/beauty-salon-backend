import { Router } from "express";
import Service from "../models/Service.js";
import Beautician from "../models/Beautician.js";
import Appointment from "../models/Appointment.js";
const r = Router();
r.get("/", async (req,res)=>{
  const list = await Appointment.find().sort({ start:-1 }).lean();
  const serviceIds = [...new Set(list.map(a=>String(a.serviceId)))];
  const beauticianIds = [...new Set(list.map(a=>String(a.beauticianId)))];
  const [services, beauticians] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }).lean(),
    Beautician.find({ _id: { $in: beauticianIds } }).lean()
  ]);
  const sMap = Object.fromEntries(services.map(s=>[String(s._id), s]));
  const bMap = Object.fromEntries(beauticians.map(b=>[String(b._id), b]));
  const rows = list.map(a => ({ ...a, service: sMap[String(a.serviceId)] || null, beautician: bMap[String(a.beauticianId)] || null }));
  res.json(rows);
});
r.post("/", async (req,res)=>{
  const { beauticianId, any, serviceId, variantName, startISO, client } = req.body;
  const service = await Service.findById(serviceId).lean(); if(!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants||[]).find(v => v.name === variantName); if(!variant) return res.status(404).json({ error: "Variant not found" });
  let beautician = null;
  if(any){ beautician = await Beautician.findOne({ _id: { $in: service.beauticianIds }, active:true }).lean(); }
  else { beautician = await Beautician.findById(beauticianId).lean(); }
  if(!beautician) return res.status(400).json({ error: "No beautician available" });
  const start = new Date(startISO);
  const end = new Date(start.getTime() + (variant.durationMin + (variant.bufferBeforeMin||0) + (variant.bufferAfterMin||0)) * 60000);
  const conflict = await Appointment.findOne({ beauticianId: beautician._id, start: { $lt: end }, end: { $gt: start } }).lean();
  if(conflict) return res.status(409).json({ error: "Slot no longer available" });
  const appt = await Appointment.create({ client, beauticianId: beautician._id, serviceId, variantName, start, end, price: variant.price, status: "reserved_unpaid" });
  res.json({ ok:true, appointmentId: appt._id });
});
export default r;
