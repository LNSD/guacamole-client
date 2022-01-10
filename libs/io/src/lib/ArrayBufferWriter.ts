import {Status} from './Status';
import OutputStream from './OutputStream';

export type OnAckCallback = (status: Status) => void;

/**
 * The default maximum blob length for new ArrayBufferWriter
 * instances.
 *
 * @constant
 * @type {Number}
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const DEFAULT_BLOB_LENGTH = 6048;

/**
 * A writer which automatically writes to the given output stream with arbitrary
 * binary data, supplied as ArrayBuffers.
 */
export default class ArrayBufferWriter {
  /**
   * Fired for received data, if acknowledged by the server.
   * @event
   * @param {Status} status The status of the operation.
   */
  public onack: OnAckCallback | null = null;

  /**
   * The maximum length of any blob sent by this ArrayBufferWriter,
   * in bytes. Data sent via
   * [sendData()]{@link ArrayBufferWriter#sendData} which exceeds
   * this length will be split into multiple blobs. As the Guacamole protocol
   * limits the maximum size of any instruction or instruction element to
   * 8192 bytes, and the contents of blobs will be base64-encoded, this value
   * should only be increased with extreme caution.
   *
   * @type {Number}
   * @default {@link DEFAULT_BLOB_LENGTH}
   */
  public blobLength: number = DEFAULT_BLOB_LENGTH;

  /*
  * @constructor
  * @param {OutputStream} stream The stream that data will be written
  *                                        to.
  */
  constructor(private readonly stream: OutputStream) {
    // Simply call onack for acknowledgements
    this.stream.onack = (status: any) => {
      if (this.onack !== null) {
        this.onack(status);
      }
    };
  }

  /**
   * Sends the given data.
   *
   * @param {ArrayBuffer|TypedArray} data The data to send.
   */
  public sendData(data: string | ArrayBuffer | ArrayBufferLike) {
    let bytes: Uint8Array;

    if (typeof data === 'string') {
      bytes = Uint8Array.from(data, x => x.charCodeAt(0));
    } else {
      bytes = new Uint8Array(data);
    }

    // If small enough to fit into single instruction, send as-is
    if (bytes.length <= this.blobLength) {
      this.__sendBlob(bytes);
    } else {
      // Otherwise, send as multiple instructions
      for (let offset = 0; offset < bytes.length; offset += this.blobLength) {
        this.__sendBlob(bytes.subarray(offset, offset + this.blobLength));
      }
    }
  }

  /**
   * Signals that no further text will be sent, effectively closing the
   * stream.
   */
  public sendEnd() {
    this.stream.sendEnd();
  }

  /**
   * Encodes the given data as base64, sending it as a blob. The data must
   * be small enough to fit into a single blob instruction.
   *
   * @private
   * @param {Uint8Array} bytes The data to send.
   */
  private __sendBlob(bytes: Uint8Array) {
    let binary = '';

    // Produce binary string from bytes in buffer
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    // Send as base64
    this.stream.sendBlob(btoa(binary));
  }
}

