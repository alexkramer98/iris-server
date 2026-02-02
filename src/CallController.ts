import { randomBytes } from "node:crypto";

import type AppClient from "./AppClient";
import type HassClient, { CallPayload } from "./HassClient";
import type SpeechConverter from "./SpeechConverter";

export default class CallController {
  public constructor(
    private readonly config: {
      serverUrl: string;
    },
    private readonly hassClient: HassClient,
    private readonly appClient: AppClient,
    private readonly speechConverter: SpeechConverter,
  ) {}

  public async call(payload: CallPayload) {
    const tokenLength = 32;
    const token = randomBytes(tokenLength).toString("base64");

    const audio = await this.speechConverter.synthesize(payload.text);

    this.hassClient.send("startCall", {
      target: payload.target,
      url: `${this.config.serverUrl}?token=${token}`,
    });

    this.appClient.registerCallHandler();
  }
}
