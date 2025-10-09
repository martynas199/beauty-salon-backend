import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
const MONGO_URI = process.env.MONGO_URI; await mongoose.connect(MONGO_URI);
await Service.deleteMany({}); await Beautician.deleteMany({});
const b1 = await Beautician.create({ name:"Anna Brow", specialties:["Brows","Lashes"], active:true,
  workingHours:{ mon:{start:"09:00",end:"17:00",breaks:[{start:"12:00",end:"12:30"}]}, tue:{start:"09:00",end:"17:00",breaks:[{start:"12:00",end:"12:30"}]}, wed:{start:"09:00",end:"17:00",breaks:[{start:"12:00",end:"12:30"}]}, thu:{start:"09:00",end:"17:00",breaks:[{start:"12:00",end:"12:30"}]}, fri:{start:"09:00",end:"17:00",breaks:[{start:"12:00",end:"12:30"}]}, sat:{start:"10:00",end:"15:00",breaks:[]}, sun:{} } });
const b2 = await Beautician.create({ name:"Mia Lashes", specialties:["Lashes"], active:true,
  workingHours:{ mon:{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"13:30"}]}, tue:{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"13:30"}]}, wed:{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"13:30"}]}, thu:{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"13:30"}]}, fri:{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"13:30"}]}, sat:{start:"10:00",end:"14:00",breaks:[]}, sun:{} } });
const s1 = await Service.create({ name:"Brow Shaping", category:"Brows", variants:[ {name:"Standard", durationMin:30, price:25, bufferBeforeMin:5, bufferAfterMin:10}, {name:"Deluxe", durationMin:45, price:40, bufferBeforeMin:5, bufferAfterMin:10} ], beauticianIds:[b1._id] });
const s2 = await Service.create({ name:"Classic Lashes", category:"Lashes", variants:[ {name:"Classic Full Set", durationMin:90, price:65, bufferBeforeMin:10, bufferAfterMin:15}, {name:"Infills", durationMin:60, price:40, bufferBeforeMin:5, bufferAfterMin:10} ], beauticianIds:[b1._id,b2._id] });
console.log("Seeded beauticians:", b1.name, b2.name); console.log("Seeded services:", s1.name, s2.name);
await mongoose.disconnect(); process.exit(0);
