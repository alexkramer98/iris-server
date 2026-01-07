import { Buffer } from "node:buffer";

import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { z } from "zod";

import { environment } from "./Environment";
import logger from "./Logger";

/* eslint-disable @stylistic/padding-line-between-statements -- keep the types together */
type CallRequestHandler = (
  target: string,
  payload: CallRequestPayload,
) => Promise<string>;
type ClearNotificationRequestHandler = (target: string, id: string) => void;
type NotificationRequestHandler = (
  target: string,
  payload: NotificationRequestPayload,
) => Promise<void>;
type ReplayNotificationsRequestHandler = (target: string) => Promise<void>;
/* eslint-enable @stylistic/padding-line-between-statements -- keep the types together */

export default class ApiServer {
  private readonly wsServer: WebSocketServer;

  private activeClient: WebSocket | undefined;

  private readonly commandSchema = z.discriminatedUnion("command", [
    // todo: language property for calls
    z.object({
      command: z.literal("call"),
      target: z.string(),

      payload: z.object({
        text: z.string(),
        actions: z.array(z.object({ id: z.string(), text: z.string() })),
      }),
    }),
    z.object({
      command: z.literal("notify"),
      target: z.string(),

      payload: z.object({
        title: z.string(),
        icon: z.string(),
        text: z.string(),
        actions: z.array(z.object({ id: z.string(), text: z.string() })),
        channel: z.string(),
        isPersistent: z.boolean(),
        isSticky: z.boolean(),
      }),
    }),
    z.object({
      command: z.literal("clear-notification"),
      target: z.string(),

      payload: z.object({
        id: z.string(),
      }),
    }),
    z.object({
      command: z.literal("replay"),
      target: z.string(),
    }),
  ]);

  public constructor(
    private readonly handlers: {
      callRequestHandler: CallRequestHandler;
      clearNotificationRequestHandler: ClearNotificationRequestHandler;
      notificationRequestHandler: NotificationRequestHandler;
      replayNotificationsRequest: ReplayNotificationsRequestHandler;
    },
  ) {
    this.wsServer = new WebSocketServer({ port: environment.API_PORT });
    this.wsServer.on("connection", (client) => {
      if (this.activeClient !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 1008: Policy Violation
        this.activeClient.close(1008, "Another client has connected");
      }

      this.activeClient = client;

      client.on("error", (error) => {
        if (this.activeClient !== client) {
          logger.error(
            "An error occurred on the api websocket. Closing connection",
            error,
          );
          this.activeClient?.close(
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
          void this.handleMessage(client, message);
        }
      });
    });
  }

  private parseMessage(message: RawData) {
    if (!Buffer.isBuffer(message)) {
      throw new TypeError("Expected message to be a Buffer");
    }

    return this.commandSchema.parse(JSON.parse(message.toString()));
  }

  private async handleCommand(command: z.infer<typeof this.commandSchema>) {
    // eslint-disable-next-line default-case -- impossible to fall back to default as this is a discriminated union
    switch (command.command) {
      case "call": {
        await this.handlers.callRequestHandler(command.target, command.payload);

        break;
      }
      case "clear-notification": {
        this.handlers.clearNotificationRequestHandler(
          command.target,
          command.payload.id,
        );

        break;
      }
      case "notify": {
        await this.handlers.notificationRequestHandler(
          command.target,
          command.payload,
        );

        break;
      }

      case "replay": {
        await this.handlers.replayNotificationsRequest(command.target);

        break;
      }
    }
  }

  private logErrorAndReply(
    client: WebSocket,
    errorMessage: string,
    cause: unknown,
  ) {
    logger.error(errorMessage, cause);
    client.send(JSON.stringify({ event: "error", errorMessage }));
  }

  private async handleMessage(
    client: WebSocket,
    message: RawData,
  ): Promise<void> {
    let command: z.infer<typeof this.commandSchema> | undefined = undefined;

    try {
      command = this.parseMessage(message);
    } catch (error) {
      this.logErrorAndReply(
        client,
        "Unable to parse message. Message malformed or not JSON",
        error,
      );

      return;
    }

    try {
      await this.handleCommand(command);
    } catch (error) {
      this.logErrorAndReply(client, "Error while handling command", error);

      return;
    }

    client.send(
      JSON.stringify({
        event: "success",
      }),
    );
  }

  public clearNotification(target: string, id: string) {
    if (this.activeClient === undefined) {
      throw new Error("Cannot clear notification: No active client");
    }

    this.activeClient.send(
      JSON.stringify({
        command: "call-service",

        payload: {
          action: target,

          data: {
            message: "clear_notification",

            data: {
              tag: id,
              priority: "high",
              ttl: 0,
            },
          },
        },
      }),
    );
  }

  public triggerCall(target: string, token: string) {
    if (this.activeClient === undefined) {
      throw new Error("Cannot trigger call: no active client");
    }

    const url = `${environment.SERVER_URL}?token=${token}`;

    this.activeClient.send(
      JSON.stringify({
        command: "call-service",

        payload: {
          action: target,

          data: {
            message: "command_activity",

            data: {
              intent_action: "android.intent.action.VIEW",
              intent_uri: `iris://trigger-call?url=${url}`,
              intent_package_name: "com.iris.companion",
              priority: "high",
              ttl: 0,
            },
          },
        },
      }),
    );
  }
}
