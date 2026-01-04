import SpeechConverterError from "./SpeechConverterError";

export default class SynthesizeError extends SpeechConverterError {
  public readonly name: string = "SynthesizeError";

  public constructor(message: string) {
    super(message);
  }
}
