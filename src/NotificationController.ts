import type HassClient from "./HassClient";
import type { NotificationPayload } from "./HassClient";

export default class NotificationController {
  private storedNotifications: NotificationPayload[] = [];

  public constructor(private readonly hassClient: HassClient) {}

  public send(notification: NotificationPayload) {
    this.unstoreNotification(notification.target, notification.id);

    if (notification.isPersistent) {
      this.storedNotifications.push(notification);
    }

    this.hassClient.send("notify", notification);
  }

  public clear(target: string, id: string) {
    this.unstoreNotification(target, id);

    this.hassClient.send("unNotify", { target, id });
  }

  public resendIfExists(target: string, id: string) {
    const notification = this.storedNotifications.find(
      (item) => item.target === target && item.id === id,
    );

    if (notification !== undefined) {
      this.hassClient.send("notify", notification);
    }
  }

  public resendAll(target: string) {
    this.storedNotifications
      .filter((item) => item.target === target)
      .forEach((notification) => {
        this.hassClient.send("notify", notification);
      });
  }

  private unstoreNotification(target: string, id: string) {
    this.storedNotifications = this.storedNotifications.filter(
      (item) => !(item.target === target && item.id === id),
    );
  }
}
