import { Buffer } from "node:buffer";
import type { Socket } from "node:net";

import { PromiseSocket } from "promise-socket";
import { z } from "zod";

import type SpeechConverter from "./SpeechConverter";

export default class WyomingSpeechConverter implements SpeechConverter {
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- not a magic number here
  private readonly socketTimeout = 30_000;

  public constructor(
    private readonly config: {
      piperHost: string;
      piperPort: number;
      whisperHost: string;
      whisperPort: number;
    },
  ) {}

  private async sendJson(socket: PromiseSocket<Socket>, message: object) {
    await socket.write(`${JSON.stringify(message)}\n`);
  }

  private async readStreamUntil(
    socket: PromiseSocket<Socket>,
    searchQuery: string,
  ) {
    let buffer = Buffer.alloc(0);

    for await (const chunk of socket) {
      if (typeof chunk === "string") {
        throw new TypeError(`Unexpected string chunk received: ${chunk}`);
      }

      buffer = Buffer.concat([buffer, chunk]);

      if (buffer.includes(searchQuery)) {
        return buffer;
      }
    }

    return undefined;
  }

  private async getSocket(port: number, host: string) {
    const socket = new PromiseSocket();

    socket.setTimeout(this.socketTimeout);
    await socket.connect(port, host);

    return socket;
  }

  private async sendTranscriptionRequest(
    socket: PromiseSocket<Socket>,
    audioBuffer: Buffer,
  ) {
    await this.sendJson(socket, {
      type: "transcribe",
    });
    await this.sendJson(socket, {
      type: "audio-chunk",
      data: { rate: 16_000, width: 2, channels: 1 },
      payload_length: audioBuffer.length,
    });
    await socket.write(audioBuffer);
    await this.sendJson(socket, { type: "audio-stop" });
  }

  private parseTranscriptionResult(buffer: Buffer) {
    const [rawHeader, rawPayload] = buffer.toString().split("\n");

    if (rawHeader === undefined || rawPayload === undefined) {
      throw new Error("Invalid result received from Whisper");
    }

    const headerSchema = z.object({ data_length: z.number() });
    const header = headerSchema.parse(JSON.parse(rawHeader));

    const payloadSchema = z.object({ text: z.string() });
    const payload = payloadSchema.parse(
      JSON.parse(rawPayload.slice(0, Math.max(0, header.data_length))),
    );

    return payload.text;
  }

  public async transcribe(audioBuffer: Buffer): Promise<string> {
    const socket = await this.getSocket(
      this.config.whisperPort,
      this.config.whisperHost,
    );

    try {
      await this.sendTranscriptionRequest(socket, audioBuffer);

      const result = await this.readStreamUntil(socket, '{"text": "');

      if (result === undefined) {
        throw new Error("No result received from Whisper");
      }

      return this.parseTranscriptionResult(result);
    } finally {
      socket.destroy();
    }
  }

  private collectAudioChunks(buffer: Buffer, initialOffset: number) {
    let audioChunks = Buffer.alloc(0);

    let startOffset = buffer.indexOf("null}", initialOffset);
    let endOffset = 0;

    // gather all binary audio data between the JSON lines
    while (startOffset !== -1) {
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- length of "null}"
      startOffset += 5;

      endOffset = buffer.indexOf('{"type', startOffset);

      audioChunks = Buffer.concat([
        audioChunks,
        buffer.subarray(startOffset, endOffset),
      ]);

      startOffset = buffer.indexOf("null}", endOffset);
    }

    return audioChunks;
  }

  private parseSynthesizeResult(buffer: Buffer) {
    const endOfHeaderOffset = buffer.indexOf("\n");

    const header = z
      .object({ data_length: z.number() })
      .parse(JSON.parse(buffer.subarray(0, endOfHeaderOffset).toString()));

    const startOffset = endOfHeaderOffset + 1;
    const endOffset = startOffset + header.data_length;

    const audioInfo = z
      .object({ rate: z.number(), channels: z.number() })
      .parse(JSON.parse(buffer.subarray(startOffset, endOffset).toString()));

    const audioChunks = this.collectAudioChunks(buffer, endOffset);

    return {
      audioInfo,
      audioChunks,
    };
  }

  public async synthesize(
    text: string,
  ): Promise<{ buffer: Buffer; channels: number; sampleRate: number }> {
    const socket = await this.getSocket(
      this.config.piperPort,
      this.config.piperHost,
    );

    try {
      await this.sendJson(socket, {
        type: "synthesize",
        data: { text },
      });

      const result = await this.readStreamUntil(socket, "audio-stop");

      if (result === undefined) {
        throw new Error("No result received from Piper");
      }

      const { audioInfo, audioChunks } = this.parseSynthesizeResult(result);

      return {
        sampleRate: audioInfo.rate,
        channels: audioInfo.channels,
        buffer: audioChunks,
      };
    } finally {
      socket.destroy();
    }
  }
}
