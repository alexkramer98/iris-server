export default interface SpeechConverter {
  synthesize: (text: string) => Promise<{
    buffer: Buffer;
    channels: number;
    sampleRate: number;
  }>;
  transcribe: (audioBuffer: Buffer) => Promise<string>;
}
