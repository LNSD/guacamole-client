export type OnBlobCallback = (data: string) => void;
export type OnEndCallback = () => void;
export type SendAckCallback = (
  index: number,
  message: string,
  code: number,
) => void;

/**
 * An input stream abstraction used by the Guacamole client to facilitate
 * transfer of files or other binary data.
 */
export class InputStream {
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
   * Called when to acknowledge the receipt of a blob..
   */
  public sendack: SendAckCallback | null = null;

  /**
   * @constructor
   *
   * @param index - The index of this stream.
   */
  constructor(public readonly index: number) {}

  /**
   * Acknowledges the receipt of a blob.
   *
   * @param message - A human-readable message describing the status or the error.
   * @param code - The error code, if any, or 0 for success.
   */
  public sendAck(message: string, code: number) {
    if (this.sendack !== null) {
      this.sendack(this.index, message, code);
    }
  }
}
