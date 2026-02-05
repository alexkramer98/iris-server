import type { RawData, WebSocket } from "ws";
import { z } from "zod";

import EventEmitter from "./EventEmitter";

const incomingMessageSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accepted"), payload: z.undefined() }),
  z.object({ action: z.literal("audioEnd"), payload: z.undefined() }),
  z.object({ action: z.literal("audioStart"), payload: z.undefined() }),
  z.object({
    action: z.literal("dtmf"),
    payload: z.object({ digit: z.string() }),
  }),
  z.object({ action: z.literal("ended"), payload: z.undefined() }),
  z.object({ action: z.literal("rejected"), payload: z.undefined() }),
]);

interface EventPayloadMap {
  accepted: undefined;
  audio: { data: Buffer };
  connected: undefined;
  disconnected: undefined;
  dtmf: { digit: string };
  ended: undefined;
  error: Error;
  rejected: undefined;
}

type OutgoingCommand =
  | { command: "audio"; payload: Buffer }
  | { command: "end" };

export default class Call extends EventEmitter<EventPayloadMap> {
  private ws: WebSocket | undefined;
  private audioChunks: Buffer[] = [];
  private isReceivingAudio = false;

  public send(message: OutgoingCommand): void {
    if (this.ws === undefined) {
      throw new Error("Cannot send: no WebSocket attached");
    }

    if (message.command === "end") {
      this.ws.send(JSON.stringify({ command: "end" }));
    } else {
      this.ws.send(JSON.stringify({ command: "audioStart" }));
      this.ws.send(message.payload);
      this.ws.send(JSON.stringify({ command: "audioEnd" }));
    }
  }

  public attach(ws: WebSocket): void {
    this.ws = ws;
    this.emit("connected", undefined);

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        this.handleBinaryMessage(data);
      } else {
        this.handleTextMessage(data);
      }
    });

    ws.on("error", (error) => {
      this.emit(
        "error",
        new Error(`WebSocket error: ${error.message}`, { cause: error }),
      );
      this.ws?.close();
    });

    ws.on("close", () => {
      this.emit("disconnected", undefined);
      this.ws = undefined;
    });
  }

  private handleBinaryMessage(data: RawData): void {
    if (!this.isReceivingAudio) {
      this.emit(
        "error",
        new Error("Received binary data outside audio stream"),
      );

      return;
    }

    // todo: probably just the first
    if (Buffer.isBuffer(data)) {
      this.audioChunks.push(data);
    } else if (Array.isArray(data)) {
      this.audioChunks.push(Buffer.concat(data));
    } else {
      this.audioChunks.push(Buffer.from(data));
    }
  }

  private handleTextMessage(data: RawData): void {
    const text = Buffer.isBuffer(data) ? data.toString() : data;

    const result = incomingMessageSchema.safeParse(JSON.parse(text));

    if (!result.success) {
      // todo: send message to client too?
      this.emit("error", new Error("Invalid message format"));

      return;
    }

    this.handleAction(result.data);
  }

  private handleAction(message: z.infer<typeof incomingMessageSchema>): void {
    // eslint-disable-next-line default-case -- exhaustiveness is checked
    switch (message.action) {
      case "accepted":
      case "dtmf":
      case "ended":
      case "rejected": {
        this.emit(message.action, message.payload);

        break;
      }
      case "audioEnd": {
        this.isReceivingAudio = false;
        this.emit("audio", { data: Buffer.concat(this.audioChunks) });
        this.audioChunks = [];

        break;
      }
      case "audioStart": {
        this.isReceivingAudio = true;
        this.audioChunks = [];

        break;
      }
    }
  }
}
