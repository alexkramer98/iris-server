import { Buffer } from "node:buffer";

import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { z } from "zod";

import EventEmitter from "./EventEmitter";

const incomingActions = {
  notify: z.object({
    action: z.literal("notify"),

    payload: z.object({
      id: z.string(),
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

  reNotify: z.object({
    action: z.literal("reNotify"),

    payload: z.object({
      target: z.string(),
      id: z.string().optional(),
    }),
  }),
};

const incomingMessageSchema = z.discriminatedUnion("action", [
  incomingActions.notify,
  incomingActions.call,
  incomingActions.unNotify,
  incomingActions.reNotify,
]);

type CallPayload = z.infer<typeof incomingActions.call>["payload"];

type IncomingActionName = keyof typeof incomingActions;

type NotificationPayload = z.infer<typeof incomingActions.notify>["payload"];

interface EventPayloadMap {
  call: z.infer<typeof incomingActions.call>["payload"];
  error: Error;
  notify: z.infer<typeof incomingActions.notify>["payload"];
  reNotify: z.infer<typeof incomingActions.reNotify>["payload"];
  unNotify: z.infer<typeof incomingActions.unNotify>["payload"];
}

interface OutgoingCommandMap {
  notify: NotificationPayload;
  startCall: {
    target: string;
    url: string;
  };
  unNotify: {
    id: string;
    target: string;
  };
}

export default class HassClient extends EventEmitter<EventPayloadMap> {
  private readonly wsServer: WebSocketServer;

  private activeClient: WebSocket | undefined;

  public constructor(config: { port: number }) {
    super();
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
          this.handleMessage(message);
        }
      });
    });
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

  private handleAction(
    action: IncomingActionName,
    payload: EventPayloadMap[IncomingActionName],
  ): void {
    this.emit(action, payload);
  }

  private emitError(error: Error): void {
    this.emit("error", error);
  }

  private emitErrorAndReply(error: Error) {
    this.sendJson({ event: "error", errorMessage: error.message });
    this.emitError(error);
  }

  private handleMessage(message: RawData) {
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
      this.handleAction(incomingMessage.action, incomingMessage.payload);
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

export type { CallPayload, NotificationPayload };
