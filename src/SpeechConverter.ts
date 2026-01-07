export default interface SpeechConverter {
  synthesize: (
    text: string,
    language: Lang,
  ) => Promise<{
    buffer: Buffer;
    channels: number;
    sampleRate: number;
  }>;
  transcribe: (audioBuffer: Buffer, language: Lang) => Promise<string>;
}
