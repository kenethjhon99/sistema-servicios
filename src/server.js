import app from "./app.js";
import dotenv from "dotenv";
import { testDB } from "./config/db.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  await testDB();
});