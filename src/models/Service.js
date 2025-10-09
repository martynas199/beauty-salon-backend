import mongoose from "mongoose";
const VariantSchema = new mongoose.Schema({ name:String, durationMin:Number, price:Number, bufferBeforeMin:{type:Number,default:0}, bufferAfterMin:{type:Number,default:10} },{ _id:false });
const ServiceSchema = new mongoose.Schema({ name:String, description:String, category:String, variants:[VariantSchema], beauticianIds:[{ type: mongoose.Schema.Types.ObjectId, ref:"Beautician" }] }, { timestamps:true });
export default mongoose.model("Service", ServiceSchema);
