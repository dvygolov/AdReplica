export class AdReplicaApp {
  constructor({ mount, destroy, state, initSession, debug, services }) {
    this.mount = mount;
    this.destroy = destroy;
    this.state = state;
    this.initSession = initSession;
    this.debug = debug;
    this.services = services;
  }

  toPublicApi() {
    return {
      mount: this.mount,
      destroy: this.destroy,
      state: this.state,
      initSession: this.initSession,
      debug: this.debug,
    };
  }
}
