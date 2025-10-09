import mongoose from "mongoose";
const AppointmentSchema = new mongoose.Schema({
  client:{ name:String, email:String, phone:String, notes:String },
  beauticianId:{ type: mongoose.Schema.Types.ObjectId, ref:"Beautician", index:true },
  serviceId:{ type: mongoose.Schema.Types.ObjectId, ref:"Service" },
  variantName:String,
  start:Date, end:Date, price:Number,
  status:{ type:String, enum:["reserved_unpaid","confirmed","cancelled"], default:"confirmed", index:true },
  payment:{ provider:String, sessionId:String, status:String }
},{ timestamps:true });
AppointmentSchema.index({ beauticianId:1, start:1 });
export default mongoose.model("Appointment", AppointmentSchema);
