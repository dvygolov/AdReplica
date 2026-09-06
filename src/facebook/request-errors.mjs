export class UncertainWriteError extends Error {
  constructor(path, cause) {
    super(
      `Write response not confirmed for ${path}: ${cause?.message || cause}. Check the result before retrying.`,
      { cause },
    );
    this.name = "UncertainWriteError";
    this.uncertain = true;
    this.path = path;
  }
}

export class GraphRequestError extends Error {
  constructor(details, status) {
    super(JSON.stringify(details, null, 2));
    this.name = "GraphRequestError";
    this.details = details;
    this.status = status;
  }
}
