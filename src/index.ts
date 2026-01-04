import { Buffer } from "node:buffer";
import fs from "node:fs";

import { config } from "dotenv";
import { WebSocketServer } from "ws";

import WyomingClient from "./WyomingClient";

config();

const apiPort = process.env.API_PORT;
const clientPort = process.env.CLIENT_PORT;
const whisperHost = process.env.WYOMING_WHISPER_HOST;
const whisperPort = process.env.WYOMING_WHISPER_PORT;
const piperHost = process.env.WYOMING_PIPER_HOST;
const piperPort = process.env.WYOMING_PIPER_PORT;

if (apiPort === undefined || clientPort === undefined) {
  throw new Error("Missing API_PORT or CLIENT_PORT");
}

if (whisperHost === undefined || whisperPort === undefined) {
  throw new Error("Missing WYOMING_WHISPER_HOST or WYOMING_WHISPER_PORT");
}

if (piperHost === undefined || piperPort === undefined) {
  throw new Error("Missing WYOMING_PIPER_HOST or WYOMING_PIPER_PORT");
}

const apiServer = new WebSocketServer({
  port: Number(apiPort),
});

const clientServer = new WebSocketServer({
  port: Number(clientPort),
});

const wyomingClient = new WyomingClient("nl", {
  whisperHost,
  whisperPort,
  piperHost,
  piperPort,
});

const pcmAudioBuffer = fs.readFileSync("audio.wav");

console.log(await wyomingClient.transcribe(pcmAudioBuffer));

const ttsResult = await wyomingClient.synthesize(
  "hallo, dit is een langere tekst. Deze tekst bevat dus veel meer data en zal langer duren.",
);

console.log(ttsResult);
writeWav22050Mono16("hier.wav", ttsResult.buffer);

function writeWav22050Mono16(filename: string, pcmBuffer: Buffer) {
  const sampleRate = 22_050;
  const channels = 1;
  const bitsPerSample = 16;

  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM
  header.writeUInt16LE(1, 20); // Audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filename, Buffer.concat([header, pcmBuffer]));
}
