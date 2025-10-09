import mongoose from "mongoose";
const DaySchema = new mongoose.Schema({ start:String, end:String, breaks:[{ start:String, end:String }] }, { _id:false });
const BeauticianSchema = new mongoose.Schema({
  name:String, email:String, phone:String, specialties:[String], active:{ type:Boolean, default:true },
  workingHours:{ mon:DaySchema, tue:DaySchema, wed:DaySchema, thu:DaySchema, fri:DaySchema, sat:DaySchema, sun:DaySchema },
  timeOff:[{ start:Date, end:Date, reason:String }]
}, { timestamps:true });
export default mongoose.model("Beautician", BeauticianSchema);
