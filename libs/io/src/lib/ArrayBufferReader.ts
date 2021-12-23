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

import InputStream from './InputStream';

export type OnDataCallback = (buffer: ArrayBuffer) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, returning
 * strictly received packets as array buffers. Note that this object will
 * overwrite any installed event handlers on the given InputStream.
 */
export default class ArrayBufferReader {
  /**
   * Fired once for every blob of data received.
   *
   * @event
   * @param {ArrayBuffer} buffer The data packet received.
   */
  public ondata: OnDataCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   *
   * @event
   */
  public onend: OnEndCallback | null = null;

  /*
   * @param {InputStream} stream The stream that data will be read
   *                             from.
   */
  constructor(private readonly stream: InputStream) {
    this.stream.onblob = data => {
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
