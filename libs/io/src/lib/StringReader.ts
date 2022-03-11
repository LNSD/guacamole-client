/* eslint-disable no-bitwise */
import { ArrayBufferReader } from './ArrayBufferReader';
import { InputStream } from './InputStream';

export type OnTextCallback = (text: string) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, returning
 * strictly text data. Note that this object will overwrite any installed event
 * handlers on the given InputStream.
 */
export class StringReader {
  /**
   * Fired once for every blob of text data received.
   *
   * @param text - The data packet received.
   */
  public ontext: OnTextCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  public onend: OnEndCallback | null = null;

  /**
   * Wrapped ArrayBufferReader.
   *
   * @private
   */
  private readonly arrayBufferReader: ArrayBufferReader;

  /**
   * The number of bytes remaining for the current codepoint.
   *
   * @private
   */
  private bytesRemaining = 0;

  /**
   * The current codepoint value, as calculated from bytes read so far.
   *
   * @private
   */
  private codepoint = 0;

  /**
   * @constructor
   *
   * @param stream - The stream that data will be read from.
   */
  constructor(stream: InputStream) {
    this.arrayBufferReader = new ArrayBufferReader(stream);

    // Receive blobs as strings
    this.arrayBufferReader.ondata = (buffer) => {
      // Decode UTF-8
      const text = this.__decodeUtf8(buffer);

      // Call handler, if present
      if (this.ontext !== null) {
        this.ontext(text);
      }
    };

    // Simply call onend when end received
    this.arrayBufferReader.onend = () => {
      if (this.onend !== null) {
        this.onend();
      }
    };
  }

  /**
   * Decodes the given UTF-8 data into a Unicode string. The data may end in
   * the middle of a multibyte character.
   *
   * @private
   * @param {ArrayBuffer} buffer Arbitrary UTF-8 data.
   * @return {String} A decoded Unicode string.
   */
  private __decodeUtf8(buffer: ArrayBuffer): string {
    let text = '';

    const bytes = new Uint8Array(buffer);
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < bytes.length; i++) {
      // Get current byte
      const value = bytes[i];

      // Start new codepoint if nothing yet read
      if (this.bytesRemaining === 0) {
        if ((value | 0x7f) === 0x7f) {
          // 1 byte (0xxxxxxx)
          text += String.fromCharCode(value);
        } else if ((value | 0x1f) === 0xdf) {
          // 2 byte (110xxxxx)
          this.codepoint = value & 0x1f;
          this.bytesRemaining = 1;
        } else if ((value | 0x0f) === 0xef) {
          // 3 byte (1110xxxx)
          this.codepoint = value & 0x0f;
          this.bytesRemaining = 2;
        } else if ((value | 0x07) === 0xf7) {
          // 4 byte (11110xxx)
          this.codepoint = value & 0x07;
          this.bytesRemaining = 3;
        } else {
          // Invalid byte
          text += '\uFFFD';
        }
      } else if ((value | 0x3f) === 0xbf) {
        // Continue existing codepoint (10xxxxxx)
        this.codepoint = (this.codepoint << 6) | (value & 0x3f);
        this.bytesRemaining--;

        // Write codepoint if finished
        if (this.bytesRemaining === 0) {
          text += String.fromCharCode(this.codepoint);
        }
      } else {
        // Invalid byte
        this.bytesRemaining = 0;
        text += '\uFFFD';
      }
    }

    return text;
  }
}
