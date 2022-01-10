import { Status } from './Status';

export type OnAckCallback = (status: Status) => void;

/**
 * Abstract stream which can receive data.
 *
 * @constructor
 * @param {Client} client The client owning this stream.
 * @param {Number} index The index of this stream.
 */
export default class OutputStream {
  /**
   * The index of this stream.
   * @type {Number}
   */
  public index: number;

  /**
   * Fired whenever an acknowledgement is received from the server, indicating
   * that a stream operation has completed, or an error has occurred.
   *
   * @event
   * @param {Status} status The status of the operation.
   */
  public onack: OnAckCallback | null = null;

  constructor(private readonly client: any /* TODO Client */, index: number) {
    this.index = index;
  }

  /**
   * Writes the given base64-encoded data to this stream as a blob.
   *
   * @param {String} data The base64-encoded data to send.
   */
  public sendBlob(data: string) {
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.client.sendBlob(this.index, data);
  }

  /**
   * Closes this stream.
   */
  public sendEnd() {
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.client.endStream(this.index);
  }
}
