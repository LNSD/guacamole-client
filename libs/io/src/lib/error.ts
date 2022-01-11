export class StreamError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
  }
}
