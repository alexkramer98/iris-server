import http from "node:http";
import type { Duplex } from "node:stream";

import { readonlyURL } from "readonly-types";
import { WebSocketServer } from "ws";

import Call from "./Call";
import EventEmitter from "./EventEmitter";

interface EventPayloadMap {
  error: Error;
}

export default class AppClient extends EventEmitter<EventPayloadMap> {
  private readonly httpServer: http.Server;
  private readonly wsServer: WebSocketServer;
  private readonly pendingCalls = new Map<string, Call>();

  public constructor(config: { port: number }) {
    super();
    this.httpServer = http.createServer();
    this.wsServer = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (request, socket, head) => {
      const token = this.getToken(request.url);

      // eslint-disable-next-line security/detect-possible-timing-attacks -- false positive
      if (token === undefined) {
        this.destroySocket(socket, "HTTP/1.1 401 Unauthorized");

        return;
      }

      const call = this.pendingCalls.get(token);

      if (call === undefined) {
        this.destroySocket(socket, "HTTP/1.1 403 Forbidden");

        return;
      }

      this.wsServer.handleUpgrade(request, socket, head, (ws) => {
        this.pendingCalls.delete(token);
        call.attach(ws);
      });
    });

    this.httpServer.on("error", (error) => {
      this.emit(
        "error",
        new Error(`HTTP server error: ${error.message}`, { cause: error }),
      );
    });
    this.wsServer.on("error", (error) => {
      this.emit(
        "error",
        new Error(`WS server error: ${error.message}`, { cause: error }),
      );
    });

    this.httpServer.listen(config.port);
  }

  public expectCall(token: string): Call {
    const call = new Call();

    this.pendingCalls.set(token, call);

    return call;
  }

  private destroySocket(socket: Duplex, message: string) {
    socket.write(`${message}\r\n\r\n`);
    socket.destroy();
  }

  private getToken(url: string | undefined) {
    return readonlyURL(url ?? "")?.searchParams.get("token") ?? undefined;
  }
}
