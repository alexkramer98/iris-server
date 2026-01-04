import SpeechConverterError from "./SpeechConverterError";

export default class TranscribeError extends SpeechConverterError {
  public readonly name: string = "TranscribeError";

  public constructor(message: string) {
    super(message);
  }
}
