import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

const server = app.listen(config.serverPort, () => {
  console.log(`swe.locker API listening on http://localhost:${config.serverPort}`);
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`Received ${signal}. Closing HTTP server.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
