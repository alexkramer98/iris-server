export default class SpeechConverterError extends Error {
  public readonly name: string = "SpeechConverterError";

  public constructor(message: string) {
    super(message);
  }
}
