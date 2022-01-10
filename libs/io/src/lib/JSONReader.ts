import StringReader from './StringReader';
import InputStream from './InputStream';

export type OnProgressCallback = (length: number) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, assembling all
 * received blobs into a JavaScript object by appending them to each other, in
 * order, and decoding the result as JSON. Note that this object will overwrite
 * any installed event handlers on the given InputStream.
 */
// TODO Review the following lint suppression
// eslint-disable-next-line @typescript-eslint/naming-convention
export default class JSONReader {
  /**
   * Fired once for every blob of data received.
   *
   * @event
   * @param {Number} length
   *     The number of characters received.
   */
  onprogress: OnProgressCallback | null = null;
  /**
   * Fired once this stream is finished and no further data will be written.
   *
   * @event
   */
  onend: OnEndCallback | null = null;
  /**
   * Wrapped StringReader.
   *
   * @private
   * @type {StringReader}
   */
  private readonly stringReader: StringReader;

  /**
   * All JSON read thus far.
   *
   * @private
   * @type {String}
   */
  private json = '';

  /* @constructor
   * @param {InputStream} stream
   *     The stream that JSON will be read from.
   */
  constructor(stream: InputStream) {
    this.stringReader = new StringReader(stream);

    // Append all received text
    this.stringReader.ontext = text => {
      // Append received text
      this.json += text;

      // Call handler, if present
      if (this.onprogress !== null) {
        this.onprogress(text.length);
      }
    };

    // Simply call onend when end received
    this.stringReader.onend = () => {
      if (this.onend !== null) {
        this.onend();
      }
    };
  }

  /**
   * Returns the current length of this JSONReader, in characters.
   *
   * @return {Number}
   *     The current length of this JSONReader.
   */
  public getLength(): number {
    return this.json.length;
  }

  /**
   * Returns the contents of this JSONReader as a JavaScript
   * object.
   *
   * @return {Object}
   *     The contents of this JSONReader, as parsed from the JSON
   *     contents of the input stream.
   */
  // TODO Review the following lint suppression
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public getJSON(): any {
    return JSON.parse(this.json);
  }
}
