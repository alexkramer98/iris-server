export default abstract class SpeechConverter<TConfig extends SpeechConfig> {
  protected constructor(
    protected readonly lang: Lang,
    protected readonly config: TConfig,
  ) {}

  public abstract transcribe(audioBuffer: Buffer): Promise<string>;
  public abstract synthesize(text: string): Promise<{
    buffer: Buffer;
    channels: number;
    sampleRate: number;
  }>;
}
