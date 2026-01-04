import { Buffer } from "node:buffer";
import type { Socket } from "node:net";

import { PromiseSocket } from "promise-socket";
import { z } from "zod";

import SynthesizeError from "./errors/SynthesizeError";
import TranscribeError from "./errors/TranscribeError";
import SpeechConverter from "./SpeechConverter";

export default class WyomingClient extends SpeechConverter<WyomingSpeechConfig> {
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- not a magic number here
  private readonly socketTimeout = 30_000;

  public constructor(lang: Lang, config: WyomingSpeechConfig) {
    super(lang, config);
  }

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
      data: { language: this.lang },
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
    try {
      const socket = await this.getSocket(
        this.config.whisperPort,
        this.config.whisperHost,
      );

      await this.sendTranscriptionRequest(socket, audioBuffer);

      const result = await this.readStreamUntil(socket, '{"text": "');

      if (result === undefined) {
        throw new Error("No result received from Whisper");
      }

      const transcript = this.parseTranscriptionResult(result);

      socket.destroy();

      return transcript;
    } catch (error) {
      throw new TranscribeError(
        `Error while transcribing audio: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
    try {
      const socket = await this.getSocket(
        this.config.piperPort,
        this.config.piperHost,
      );

      await this.sendJson(socket, {
        type: "synthesize",
        data: { text },
      });

      const result = await this.readStreamUntil(socket, "audio-stop");

      if (result === undefined) {
        throw new Error("No result received from Piper");
      }

      const { audioInfo, audioChunks } = this.parseSynthesizeResult(result);

      socket.destroy();

      return {
        sampleRate: audioInfo.rate,
        channels: audioInfo.channels,
        buffer: audioChunks,
      };
    } catch (error) {
      throw new SynthesizeError(
        `Error while synthesizing audio: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
