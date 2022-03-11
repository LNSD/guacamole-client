import { InputStream } from './InputStream';

export type OnDataCallback = (buffer: ArrayBuffer) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, returning
 * strictly received packets as array buffers. Note that this object will
 * overwrite any installed event handlers on the given InputStream.
 */
export class ArrayBufferReader {
  /**
   * Fired once for every blob of data received.
   *
   * @param buffer - The data packet received.
   */
  public ondata: OnDataCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  public onend: OnEndCallback | null = null;

  /*
   * @param stream - The stream that data will be read from.
   */
  constructor(private readonly stream: InputStream) {
    this.stream.onblob = (data) => {
      // Convert to ArrayBuffer
      const binary = atob(data);
      const arrayBuffer = new ArrayBuffer(binary.length);
      const bufferView = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binary.length; i++) {
        bufferView[i] = binary.charCodeAt(i);
      }

      // Call handler, if present
      if (this.ondata !== null) {
        this.ondata(arrayBuffer);
      }
    };

    // Simply call onend when end received
    this.onend = () => {
      if (this.onend) {
        this.onend();
      }
    };
  }
}
