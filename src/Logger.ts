class Logger {
  private getLogMessage(level: "info" | "error", message: string) {
    return `[${new Date().toISOString()}] [${level}] ${message}`;
  }

  public info(message: string) {
    // eslint-disable-next-line no-console -- this is a logging class
    console.log(this.getLogMessage("info", message));
  }

  public error(message: string, cause?: unknown) {
    // eslint-disable-next-line no-console -- this is a logging class
    console.error(this.getLogMessage("error", message), cause);
  }
}

export default Logger;
