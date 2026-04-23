import express from "express";
import cors from "cors";
import indexRoutes from "./routes/index.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", indexRoutes);

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend funcionando correctamente",
  });
});



export default app;