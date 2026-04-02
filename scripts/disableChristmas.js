require("dotenv").config();
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() =>
    mongoose.connection.db
      .collection("settings")
      .updateOne(
        { _id: "salon-settings" },
        { $set: { christmasThemeEnabled: false } },
      ),
  )
  .then(() => {
    console.log("✅ Christmas theme disabled");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
