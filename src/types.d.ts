type Lang = "nl" | "en";
interface SpeechConfig {}
interface WyomingSpeechConfig extends SpeechConfig {
  whisperHost: string;
  whisperPort: number;
  piperHost: string;
  piperPort: number;
}

interface CallRequestPayload {
  text: string;
  actions: { id: string; text: string }[];
}

interface NotificationRequestPayload {
  text: string;
  title: string;
  icon: string;
  actions: { id: string; text: string }[];
  priority: string;
  isPersistent: boolean;
  isSticky: boolean;
}

interface NotificationCommandPayload {
  text: string;
  title: string;
  icon: string;
  actions: { id: string; text: string }[];
  channel: string;
  isPersistent: boolean;
  isSticky: boolean;
  ttl: number;
  priority: string;
}
