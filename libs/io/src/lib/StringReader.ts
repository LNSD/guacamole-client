/* eslint-disable no-bitwise */
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import ArrayBufferReader from './ArrayBufferReader';
import InputStream from './InputStream';

export type OnTextCallback = (text: string) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, returning
 * strictly text data. Note that this object will overwrite any installed event
 * handlers on the given InputStream.
 */
export default class StringReader {
  /**
   * Fired once for every blob of text data received.
   *
   * @event
   * @param {String} text The data packet received.
   */
  public ontext: OnTextCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   * @event
   */
  public onend: OnEndCallback | null = null;

  /**
   * Wrapped ArrayBufferReader.
   * @private
   * @type {ArrayBufferReader}
   */
  private readonly arrayBufferReader: ArrayBufferReader;

  /**
   * The number of bytes remaining for the current codepoint.
   *
   * @private
   * @type {Number}
   */
  private bytesRemaining = 0;
  /**
   * The current codepoint value, as calculated from bytes read so far.
   *
   * @private
   * @type {Number}
   */
  private codepoint = 0;

  /*
   * @constructor
   * @param {InputStream} stream The stream that data will be read from.
   */
  constructor(stream: InputStream) {
    this.arrayBufferReader = new ArrayBufferReader(stream);

    // Receive blobs as strings
    this.arrayBufferReader.ondata = buffer => {
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
        if ((value | 0x7F) === 0x7F) {
          // 1 byte (0xxxxxxx)
          text += String.fromCharCode(value);
        } else if ((value | 0x1F) === 0xDF) {
          // 2 byte (110xxxxx)
          this.codepoint = value & 0x1F;
          this.bytesRemaining = 1;
        } else if ((value | 0x0F) === 0xEF) {
          // 3 byte (1110xxxx)
          this.codepoint = value & 0x0F;
          this.bytesRemaining = 2;
        } else if ((value | 0x07) === 0xF7) {
          // 4 byte (11110xxx)
          this.codepoint = value & 0x07;
          this.bytesRemaining = 3;
        } else {
          // Invalid byte
          text += '\uFFFD';
        }
      } else if ((value | 0x3F) === 0xBF) {
        // Continue existing codepoint (10xxxxxx)
        this.codepoint = (this.codepoint << 6) | (value & 0x3F);
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

