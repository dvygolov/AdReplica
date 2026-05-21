export class Logger {
  constructor({ appTitle, state, onRender }) {
    this.appTitle = appTitle;
    this.state = state;
    this.onRender = onRender;
  }

  log(level, message, details) {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      level,
      message,
      details: details ?? null,
      createdAt: new Date().toISOString(),
    };
    this.state.logs.push(entry);
    if (this.state.logs.length > 400) {
      this.state.logs.shift();
    }
    if (level === "error") {
      console.error(`[${this.appTitle}] ${message}`, details ?? "");
    } else if (level === "warn") {
      console.warn(`[${this.appTitle}] ${message}`, details ?? "");
    } else {
      console.log(`[${this.appTitle}] ${message}`, details ?? "");
    }
    this.onRender();
    return entry;
  }
}
