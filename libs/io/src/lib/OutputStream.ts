import { StreamError } from '..';

export type OnAckCallback = (error?: StreamError) => void;
export type sendBlob = (index: number, data: string) => void;
export type sendEnd = (index: number) => void;

/**
 * Abstract stream which can receive data.
 */
export class OutputStream {
  /**
   * Fired whenever an acknowledgement is received from the server, indicating
   * that a stream operation has completed, or an error has occurred.
   *
   * @param status - The status of the operation.
   */
  public onack: OnAckCallback | null = null;

  public sendblob: sendBlob | null = null;
  public sendend: sendEnd | null = null;

  /**
   * @constructor
   *
   * @param index - The index of this stream.
   */
  constructor(public readonly index: number) {
  }

  /**
   * Writes the given base64-encoded data to this stream as a blob.
   *
   * @param data - The base64-encoded data to send.
   */
  public sendBlob(data: string) {
    if (this.sendblob !== null) {
      this.sendblob(this.index, data);
    }
  }

  /**
   * Closes this stream.
   */
  public sendEnd() {
    if (this.sendend !== null) {
      this.sendend(this.index);
    }
  }
}
