import { InputStream } from './InputStream';

export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, returning
 * received blobs as a single data URI built over the course of the stream.
 *
 * Note that this object will overwrite any installed event handlers on the
 * given InputStream.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class DataURIReader {
  /**
   * Fired once this stream is finished and no further data will be written.
   */
  public onend: OnEndCallback | null = null;

  /**
   * Current data URI.
   *
   * @private
   */
  private uri: string;

  /*
   * @constructor
   *
   * @param stream - The stream that data will be read from.
   * @param mimetype - The mimetype of the data within the stream.
   */
  constructor(stream: InputStream, mimetype: string) {
    this.uri = 'data:' + mimetype + ';base64,';
    // Receive blobs as array buffers
    stream.onblob = (data: string) => {
      // Currently assuming data will ALWAYS be safe to simply append. This
      // will not be true if the received base64 data encodes a number of
      // bytes that isn't a multiple of three (as base64 expands in a ratio
      // of exactly 3:4).
      this.uri += data;
    };

    // Simply call onend when end received
    stream.onend = () => {
      if (this.onend !== null) {
        this.onend();
      }
    };
  }

  /**
   * Returns the data URI of all data received through the underlying stream
   * thus far.
   *
   * @returns {String}
   *     The data URI of all data received through the underlying stream thus
   *     far.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public getURI() {
    return this.uri;
  }
}
