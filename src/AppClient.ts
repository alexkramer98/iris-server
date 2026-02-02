import type { WebSocketServer } from "ws";

import { environment } from "./Environment";
import logger from "./Logger";

export default class AppClient {
  private readonly wsServer: WebSocketServer;

  public constructor(
    private readonly handlers: {
      dtmfHandler: any;
      errorHandler: any;

      hungUpHandler: any;

      // todo: al deze handlers, of een object returnen vanaf addCallHandler(token) die .on("eventName") exposet? dan zou ik ook dynamisch de micHandler callback kunnen vervangen voor een andere
      micHandler: any;
      rejectedHandler: any;
      timedOutHandler: any;
    },
  ) {
    this.wsServer = new WebSocketServer({ port: environment.API_PORT });
    this.wsServer.on("connection", (client) => {
      // todo: get session from token or reject

      client.on("error", (error) => {
        // todo: miss verderop loggen en error throwen?
        logger.error(
          "An error occurred on the companion websocket. Closing connection",
          error,
        );
        client.close(
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1011: Internal Error
          1011,
          "A ws error occurred. Please reconnect",
        );
      });

      client.on("close", () => {});

      client.on("message", (message) => {
        void this.handleMessage(client, message);
      });
    });
  }

  //   this class will send tts audio as pcm to android phone using a ws. this class is the ws server. it will then parse pcm received over the wc and run it through whisper. then somewhere else we must check if the received mic translates to a valid action given in the call. if it matches, it must send the corresponding event to hass using APiServer
}
