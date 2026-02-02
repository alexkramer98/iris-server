import type { RawData, WebSocket } from "ws";

interface EventPayloadMap {
  accepted: undefined;
  audio: { data: Buffer };
  dtmf: { digit: string };
  ended: undefined;
  error: Error;
  rejected: undefined;
  timeout: undefined;
}

type EventName = keyof EventPayloadMap;

type OutgoingCommand = { command: "audio"; data: Buffer } | { command: "end" };

interface IncomingMessage {
  action:
    | "accepted"
    | "audioEnd"
    | "audioStart"
    | "dtmf"
    | "ended"
    | "rejected";
  payload?: { digit: string };
}

const TIMEOUT_MS = 5 * 60 * 1000;

export default class Call {
  private ws: WebSocket | undefined;

  private readonly handlers = new Map<
    EventName,
    (payload: EventPayloadMap[EventName]) => void
  >();

  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  private audioChunks: Buffer[] = [];

  private isReceivingAudio = false;

  public constructor() {
    this.startTimeout();
  }

  public on<TEvent extends EventName>(
    event: TEvent,
    handler: (payload: EventPayloadMap[TEvent]) => void,
  ): void {
    this.handlers.set(
      event,
      handler as (payload: EventPayloadMap[EventName]) => void,
    );
  }

  public send(message: OutgoingCommand): void {
    if (this.ws === undefined) {
      throw new Error("Cannot send: no WebSocket attached");
    }

    if (message.command === "end") {
      this.ws.send(JSON.stringify({ command: "end" }));
    } else {
      this.ws.send(JSON.stringify({ command: "audioStart" }));
      this.ws.send(message.data);
      this.ws.send(JSON.stringify({ command: "audioEnd" }));
    }
  }

  public attach(ws: WebSocket): void {
    this.clearTimeout();
    this.ws = ws;

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
    });

    ws.on("close", () => {
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

    if (Buffer.isBuffer(data)) {
      this.audioChunks.push(data);
    } else if (Array.isArray(data)) {
      this.audioChunks.push(Buffer.concat(data));
    } else {
      this.audioChunks.push(Buffer.from(data));
    }
  }

  private handleTextMessage(data: RawData): void {
    let message: IncomingMessage;

    try {
      const text = Buffer.isBuffer(data) ? data.toString() : String(data);

      message = JSON.parse(text) as IncomingMessage;
    } catch {
      this.emit("error", new Error("Invalid JSON message"));

      return;
    }

    switch (message.action) {
      case "accepted": {
        this.emit("accepted", undefined);

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

      case "dtmf":
      case "ended":
      case "rejected": {
        this.emit(message.action, message.payload);

        break;
      }
    }
  }

  private emit<TEvent extends EventName>(
    event: TEvent,
    payload: EventPayloadMap[TEvent],
  ): void {
    this.handlers.get(event)?.(payload);
  }

  private startTimeout(): void {
    this.timeoutId = setTimeout(() => {
      this.emit("timeout", undefined);
    }, TIMEOUT_MS);
  }

  private clearTimeout(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
