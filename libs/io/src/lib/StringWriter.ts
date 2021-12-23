// TODO Review the following lint suppression
/* eslint-disable no-bitwise */

import ArrayBufferWriter from './ArrayBufferWriter';
import OutputStream from './OutputStream';
import {Status} from './Status';

export type OnAckCallback = (status: Status) => void;

// eslint-disable-next-line @typescript-eslint/naming-convention
const BUFFER_SIZE = 8192;

/**
 * A writer which automatically writes to the given output stream with text
 * data.
 */
export default class StringWriter {
  /**
   * Fired for received data, if acknowledged by the server.
   * @event
   * @param {Status} status The status of the operation.
   */
  public onack: OnAckCallback | null = null;
  /**
   * Wrapped ArrayBufferWriter.
   * @private
   * @type {ArrayBufferWriter}
   */
  private readonly arrayBufferWriter: ArrayBufferWriter;

  /**
   * Internal buffer for UTF-8 output.
   * @private
   */
  private buffer = new Uint8Array(BUFFER_SIZE);

  /**
   * The number of bytes currently in the buffer.
   * @private
   */
  private length = 0;

  /*
   * @constructor
   * @param stream - The stream that data will be written
   */
  constructor(stream: OutputStream) {
    this.arrayBufferWriter = new ArrayBufferWriter(stream);

    // Simply call onack for acknowledgements
    this.arrayBufferWriter.onack = status => {
      if (this.onack !== null) {
        this.onack(status);
      }
    };
  }

  /**
   * Sends the given text.
   *
   * @param {String} text The text to send.
   */
  public sendText(text: string) {
    if (!text.length) {
      return;
    }

    const encoded: Uint8Array = this.__encodeUtf8(text);
    this.arrayBufferWriter.sendData(encoded);
  }

  /**
   * Signals that no further text will be sent, effectively closing the
   * stream.
   */
  public sendEnd() {
    this.arrayBufferWriter.sendEnd();
  }

  /**
   * Expands the size of the underlying buffer by the given number of bytes,
   * updating the length appropriately.
   *
   * @private
   * @param {Number} bytes The number of bytes to add to the underlying
   *                       buffer.
   */
  private __expand(bytes: number) {
    // Resize buffer if more space needed
    if (this.length + bytes >= this.buffer.length) {
      const newBuffer = new Uint8Array((this.length + bytes) * 2);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }

    this.length += bytes;
  }

  /**
   * Appends a single Unicode character to the current buffer, resizing the
   * buffer if necessary. The character will be encoded as UTF-8.
   *
   * @private
   * @param {Number} codepoint The codepoint of the Unicode character to
   *                           append.
   */
  private __appendUtf8(codepoint: number) {
    let mask;
    let bytes;

    if (codepoint <= 0x7F) {
      // 1 byte
      mask = 0x00;
      bytes = 1;
    } else if (codepoint <= 0x7FF) {
      // 2 byte
      mask = 0xC0;
      bytes = 2;
    } else if (codepoint <= 0xFFFF) {
      // 3 byte
      mask = 0xE0;
      bytes = 3;
    } else if (codepoint <= 0x1FFFFF) {
      // 4 byte
      mask = 0xF0;
      bytes = 4;
    } else {
      // If invalid codepoint, append replacement character
      this.__appendUtf8(0xFFFD);
      return;
    }

    // Offset buffer by size
    this.__expand(bytes);
    let offset = this.length - 1;

    // Add trailing bytes, if any
    for (let i = 1; i < bytes; i++) {
      this.buffer[offset--] = 0x80 | (codepoint & 0x3F);
      codepoint >>= 6;
    }

    // Set initial byte
    this.buffer[offset] = mask | codepoint;
  }

  /**
   * Encodes the given string as UTF-8, returning an ArrayBuffer containing
   * the resulting bytes.
   *
   * @private
   * @param {String} text The string to encode as UTF-8.
   * @return {Uint8Array} The encoded UTF-8 data.
   */
  private __encodeUtf8(text: string): Uint8Array {
    // Fill buffer with UTF-8
    for (let i = 0; i < text.length; i++) {
      const codepoint = text.charCodeAt(i);
      this.__appendUtf8(codepoint);
    }

    if (this.length <= 0) {
      return new Uint8Array();
    }

    // Flush buffer
    const outBuffer = this.buffer.subarray(0, this.length);
    this.length = 0;
    return outBuffer;
  }
}
