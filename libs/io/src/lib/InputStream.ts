export type OnBlobCallback = (data: string) => void;
export type OnEndCallback = () => void;

/**
 * An input stream abstraction used by the Guacamole client to facilitate
 * transfer of files or other binary data.
 */
export class InputStream {
  /**
   * The index of this stream.
   */
  public readonly index: number;

  /**
   * Called when a blob of data is received.
   *
   * @param data - The received base64 data.
   */
  public onblob: OnBlobCallback | null = null;

  /**
   * Called when this stream is closed.
   */
  public onend: OnEndCallback | null = null;

  /**
   * @constructor
   *
   * @param {Client} client The client owning this stream.
   * @param {Number} index The index of this stream.
   */
  constructor(private readonly client: any /* TODO Client */, index: number) {
    this.index = index;
  }

  /**
   * Acknowledges the receipt of a blob.
   *
   * @param message - A human-readable message describing the status or the error.
   * @param code - The error code, if any, or 0 for success.
   */
  public sendAck(message: string, code: number) {
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.client.sendAck(this.index, message, code);
  }
}
