/** Logging. Dependencies are supplied by the application composition root. */
export class Logging {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.log = this.log.bind(this);
  }

  log(level, message, details) {
    const { logger } = this.dependencies;
    return logger.log(level, message, details);
  }
}
