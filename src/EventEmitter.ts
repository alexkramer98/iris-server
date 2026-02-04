export default abstract class EventEmitter<TEventMap> {
  private readonly handlers = new Map<
    keyof TEventMap,
    (payload: TEventMap[keyof TEventMap]) => void
  >();

  public on<TEvent extends keyof TEventMap>(
    event: TEvent,
    handler: (payload: TEventMap[TEvent]) => void,
  ): void {
    this.handlers.set(
      event,
      handler as (payload: TEventMap[keyof TEventMap]) => void,
    );
  }

  public off<TEvent extends keyof TEventMap>(event: TEvent): void {
    this.handlers.delete(event);
  }

  protected emit<TEvent extends keyof TEventMap>(
    event: TEvent,
    payload: TEventMap[TEvent],
  ): void {
    this.handlers.get(event)?.(payload);
  }
}
