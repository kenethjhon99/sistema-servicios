import app from "./app.js";
import { env } from "./config/env.js";
import { testDB } from "./config/db.js";

const PORT = env.PORT;

const server = app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🌎 Entorno: ${env.NODE_ENV}`);
  await testDB();
});

// Apagado elegante
const shutdown = (signal) => {
  console.log(`\n${signal} recibido. Cerrando servidor...`);
  server.close(() => {
    console.log("Servidor HTTP cerrado.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Cierre forzado por timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
