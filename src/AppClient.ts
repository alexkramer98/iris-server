import { readonlyURL } from "readonly-types";
import { WebSocketServer } from "ws";

import Call from "./Call";
import EventEmitter from "./EventEmitter";

interface EventPayloadMap {
  error: Error;
}

export default class AppClient extends EventEmitter<EventPayloadMap> {
  private readonly wsServer: WebSocketServer;

  private readonly pendingCalls = new Map<string, Call>();

  public constructor(config: { port: number }) {
    super();
    this.wsServer = new WebSocketServer({ port: config.port });

    this.wsServer.on("connection", (ws, request) => {
      const token = this.extractToken(request.url);

      // eslint-disable-next-line security/detect-possible-timing-attacks -- false positive
      if (token === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1008: Policy Violation
        ws.close(1008, "Missing token");

        return;
      }

      const call = this.pendingCalls.get(token);

      if (call === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1008: Policy Violation
        ws.close(1008, "Invalid token");

        return;
      }

      this.pendingCalls.delete(token);
      call.attach(ws);
    });

    this.wsServer.on("error", (error) => {
      this.emit(
        "error",
        new Error(`WebSocket server error: ${error.message}`, { cause: error }),
      );
    });
  }

  public expectCall(token: string): Call {
    const call = new Call();

    this.pendingCalls.set(token, call);

    return call;
  }

  private extractToken(url: string | undefined): string | undefined {
    return readonlyURL(url ?? "")?.searchParams.get("token") ?? undefined;
  }
}
