type Lang = "nl" | "en";
interface SpeechConfig {}
interface WyomingSpeechConfig extends SpeechConfig {
  whisperHost: string;
  whisperPort: number;
  piperHost: string;
  piperPort: number;
}
