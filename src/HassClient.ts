import { Buffer } from "node:buffer";

import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { z } from "zod";

interface OutgoingCommandMap {
  notify: {
    actions: { id: string; text: string }[];
    icon: string;
    isPersistent: boolean;
    isSticky: boolean;
    priority: string;
    target: string;
    text: string;
    title: string;
  };
  startCall: {
    target: string;
    url: string;
  };
  unNotify: {
    id: string;
    target: string;
  };
}

const incomingActions = {
  notify: z.object({
    action: z.literal("notify"),

    payload: z.object({
      target: z.string(),
      title: z.string(),
      icon: z.string(),
      text: z.string(),
      actions: z.array(z.object({ id: z.string(), text: z.string() })),
      priority: z.string(),
      isPersistent: z.boolean(),
      isSticky: z.boolean(),
    }),
  }),

  call: z.object({
    action: z.literal("call"),

    payload: z.object({
      target: z.string(),
      text: z.string(),
      actions: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  }),

  unNotify: z.object({
    action: z.literal("unNotify"),

    payload: z.object({
      target: z.string(),
      id: z.string(),
    }),
  }),

  replay: z.object({
    action: z.literal("replay"),

    payload: z.object({
      target: z.string(),
    }),
  }),
};

const incomingMessageSchema = z.discriminatedUnion("action", [
  incomingActions.notify,
  incomingActions.call,
  incomingActions.unNotify,
  incomingActions.replay,
]);

type IncomingActionName = keyof typeof incomingActions;

type IncomingActionPayload<TAction extends IncomingActionName> = z.infer<
  (typeof incomingActions)[TAction]
>["payload"];

export default class HassServer {
  private readonly wsServer: WebSocketServer;

  private activeClient: WebSocket | undefined;

  private readonly actionHandlers: Partial<{
    [TAction in IncomingActionName]: (
      payload: IncomingActionPayload<TAction>,
    ) => Promise<void>;
  }> = {};

  private errorHandler: ((payload: Error) => void) | undefined = undefined;

  public constructor(config: { port: number }) {
    this.wsServer = new WebSocketServer({ port: config.port });

    this.wsServer.on("connection", (client) => {
      if (this.activeClient !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1008: Policy Violation
        this.activeClient.close(1008, "Another client has connected");
      }

      this.activeClient = client;

      client.on("error", (error) => {
        if (this.activeClient === client) {
          this.emitErrorAndReply(
            new Error(
              `An error occurred on the api websocket: ${this.getErrorMessages(error)}`,
              { cause: error },
            ),
          );

          client.close(
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1011: Internal Error
            1011,
            "A ws error occurred. Please reconnect",
          );

          this.activeClient = undefined;
        }
      });

      client.on("close", () => {
        if (this.activeClient === client) {
          this.activeClient = undefined;
        }
      });

      client.on("message", (message) => {
        if (this.activeClient === client) {
          void this.handleMessage(message);
        }
      });
    });
  }

  public onAction<TAction extends IncomingActionName>(
    action: TAction,
    handler: (payload: IncomingActionPayload<TAction>) => Promise<void>,
  ) {
    this.actionHandlers[action] = handler;
  }

  public onError(handler: (payload: Error) => void) {
    this.errorHandler = handler;
  }

  public send<TAction extends keyof OutgoingCommandMap>(
    command: TAction,
    payload: OutgoingCommandMap[TAction],
  ) {
    this.sendJson({ command, payload });
  }

  private getErrorMessages(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error";
  }

  private parseMessage(message: RawData) {
    if (!Buffer.isBuffer(message)) {
      throw new TypeError("Expected message to be a Buffer");
    }

    return incomingMessageSchema.parse(JSON.parse(message.toString()));
  }

  private async handleAction<TAction extends IncomingActionName>(
    action: TAction,
    payload: IncomingActionPayload<TAction>,
  ) {
    await this.actionHandlers[action]?.(payload);
  }

  private emitError(error: Error) {
    this.errorHandler?.(error);
  }

  private emitErrorAndReply(error: Error) {
    this.sendJson({ event: "error", errorMessage: error.message });
    this.emitError(error);
  }

  private async handleMessage(message: RawData) {
    let incomingMessage: z.infer<typeof incomingMessageSchema> | undefined =
      undefined;

    try {
      incomingMessage = this.parseMessage(message);
    } catch (error) {
      this.emitErrorAndReply(
        new Error(
          `Unprocessable payload received: ${this.getErrorMessages(error)}`,
          { cause: error },
        ),
      );

      return;
    }

    try {
      await this.handleAction(incomingMessage.action, incomingMessage.payload);
    } catch (error) {
      this.emitErrorAndReply(
        new Error(
          `Error while handling action "${incomingMessage.action}": ${this.getErrorMessages(error)}`,
          {
            cause: error,
          },
        ),
      );
    }
  }

  private sendJson(payload: object) {
    if (this.activeClient === undefined) {
      throw new Error("Cannot send command: No active client");
    }

    this.activeClient.send(JSON.stringify(payload));
  }
}
