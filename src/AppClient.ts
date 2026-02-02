import { WebSocketServer } from "ws";

import Call from "./Call";

export default class AppClient {
  private readonly wsServer: WebSocketServer;

  private readonly pendingCalls = new Map<string, Call>();

  public constructor(config: { port: number }) {
    this.wsServer = new WebSocketServer({ port: config.port });

    this.wsServer.on("connection", (ws, request) => {
      const token = this.extractToken(request.url);

      if (token === undefined) {
        ws.close(1008, "Missing token");

        return;
      }

      const call = this.pendingCalls.get(token);

      if (call === undefined) {
        ws.close(1008, "Invalid token");

        return;
      }

      this.pendingCalls.delete(token);
      call.attach(ws);
    });
  }

  public expectCall(token: string): Call {
    const call = new Call();

    this.pendingCalls.set(token, call);

    return call;
  }

  private extractToken(url: string | undefined): string | undefined {
    if (url === undefined) {
      return undefined;
    }

    const searchParameters = new URLSearchParams(url.split("?")[1]);

    return searchParameters.get("token") ?? undefined;
  }
}
