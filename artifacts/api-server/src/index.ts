import http from "http";
import type { Socket } from "net";
import app, { wsProxy } from "./app";
import { logger } from "./lib/logger";
import { startLoon, incrementConnectedClients, decrementConnectedClients } from "./lib/loon-manager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/ws")) {
    incrementConnectedClients();
    socket.on("close", () => decrementConnectedClients());
  }
  wsProxy.upgrade(req, socket as Socket, head);
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Auto-start loon proxy on boot
  startLoon()
    .then(() => logger.info("Loon auto-started on boot"))
    .catch((e) => logger.warn({ err: e }, "Loon auto-start failed — start manually from dashboard"));
});
