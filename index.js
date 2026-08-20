import "dotenv/config";
import express from "express";
import db from "./src/db/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import cors from "cors";

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://cryptomintx.co.in"
  ],
  credentials: true,
}));

app.use(express.json());
app.use("/api/auth", authRoutes);

db();

app.get("/", (req,res) => {
    res.send("Hello world!")
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
})
