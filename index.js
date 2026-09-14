import "dotenv/config";
import express from "express";
import db from "./src/db/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import cors from "cors";
import profileRoutes from "./src/routes/profile.routes.js";
import path from "path";
import walletRoutes from "./src/routes/wallet.routes.js";
import withdrawalRoutes from "./src/routes/withdrawal.routes.js";


const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://cryptomintx.co.in"
  ],
  credentials: true,
}));

app.use(
  "/uploads",
  express.static(
    path.join(process.cwd(), "uploads")
  )
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api", profileRoutes);
app.use("/api", walletRoutes);
app.use("/api", withdrawalRoutes);

db();

app.get("/", (req,res) => {
    res.send("Hello world!")
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
})
