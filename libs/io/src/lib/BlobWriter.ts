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

import ArrayBufferWriter from './ArrayBufferWriter';
import OutputStream from './OutputStream';
import {Status} from './Status';

export type OnAckCallback = (status: Status) => void;
export type OnErrorCallback = (blob: Blob, offset: number, error: DOMException | null) => void;
export type OnProgressCallback = (blob: Blob, number: number) => void;
export type OnCompleteCallback = (blob: Blob) => void;

/**
 * A writer which automatically writes to the given output stream with the
 * contents of provided Blob objects.
 *
 * @constructor
 * @param {OutputStream} stream
 *     The stream that data will be written to.
 */
export default class BlobWriter {
  /**
   * Wrapped ArrayBufferWriter which will be used to send any
   * provided file data.
   *
   * @private
   * @type {ArrayBufferWriter}
   */
  arrayBufferWriter: ArrayBufferWriter;

  /**
   * Fired for received data, if acknowledged by the server.
   *
   * @event
   * @param {Status} status
   *     The status of the operation.
   */
  onack: OnAckCallback | null = null;

  /**
   * Fired when an error occurs reading a blob passed to
   * [sendBlob()]{@link BlobWriter#sendBlob}. The transfer for the
   * the given blob will cease, but the stream will remain open.
   *
   * @event
   * @param {Blob} blob
   *     The blob that was being read when the error occurred.
   *
   * @param {Number} offset
   *     The offset of the failed read attempt within the blob, in bytes.
   *
   * @param {DOMError} error
   *     The error that occurred.
   */
  onerror: OnErrorCallback | null = null;

  /**
   * Fired for each successfully-read chunk of data as a blob is being sent
   * via [sendBlob()]{@link BlobWriter#sendBlob}.
   *
   * @event
   * @param {Blob} blob
   *     The blob that is being read.
   *
   * @param offset - The offset of the read that just succeeded.
   */
  onprogress: OnProgressCallback | null = null;

  /**
   * Fired when a blob passed to
   * [sendBlob()]{@link BlobWriter#sendBlob} has finished being
   * sent.
   *
   * @event
   * @param {Blob} blob
   *     The blob that was sent.
   */
  oncomplete: OnCompleteCallback | null = null;

  constructor(stream: OutputStream) {
    this.arrayBufferWriter = new ArrayBufferWriter(stream);

    // Initially, simply call onack for acknowledgements
    this.arrayBufferWriter.onack = (status: Status) => {
      if (this.onack !== null) {
        this.onack(status);
      }
    };
  }

  /**
   * Sends the contents of the given blob over the underlying stream.
   *
   * @param blob - The blob to send.
   */
  sendBlob(blob: Blob) {
    let offset = 0;
    const reader = new FileReader();

    /**
     * Reads the next chunk of the blob provided to
     * [sendBlob()]{@link BlobWriter#sendBlob}. The chunk itself
     * is read asynchronously, and will not be available until
     * reader.onload fires.
     *
     * @private
     */
    const readNextChunk = () => {
      // If no further chunks remain, inform of completion and stop
      if (offset >= blob.size) {
        // Fire completion event for completed blob
        if (this.oncomplete) {
          this.oncomplete(blob);
        }

        // No further chunks to read
        return;
      }

      // Obtain reference to next chunk as a new blob
      const chunk = this.slice(blob, offset, offset + this.arrayBufferWriter.blobLength);
      offset += this.arrayBufferWriter.blobLength;

      // Attempt to read the blob contents represented by the blob into
      // a new array buffer
      reader.readAsArrayBuffer(chunk);
    };

    // Send each chunk over the stream, continue reading the next chunk
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      if (ev.target === null) {
        return;
      }

      const {result} = ev.target;
      if (result !== null) {
        // Send the successfully-read chunk
        this.arrayBufferWriter.sendData(result);
      }

      // Continue sending more chunks after the latest chunk is
      // acknowledged
      this.arrayBufferWriter.onack = (status: Status) => {
        if (this.onack !== null) {
          this.onack(status);
        }

        // Abort transfer if an error occurs
        if (status.isError()) {
          return;
        }

        // Inform of blob upload progress via progress events
        if (this.onprogress !== null) {
          this.onprogress(blob, offset - this.arrayBufferWriter.blobLength);
        }

        // Queue the next chunk for reading
        readNextChunk();
      };
    };

    // If an error prevents further reading, inform of error and stop
    reader.onerror = () => {
      // Fire error event, including the context of the error
      if (this.onerror !== null) {
        this.onerror(blob, offset, reader.error);
      }
    };

    // Begin reading the first chunk
    readNextChunk();
  }

  /**
   * Signals that no further text will be sent, effectively closing the
   * stream.
   */
  sendEnd() {
    this.arrayBufferWriter.sendEnd();
  }

  /**
   * Browser-independent implementation of Blob.slice() which uses an end
   * offset to determine the span of the resulting slice, rather than a
   * length.
   *
   * @private
   * @param blob - The Blob to slice.
   *
   * @param start - The starting offset of the slice, in bytes, inclusive.
   * @param end - The ending offset of the slice, in bytes, exclusive.
   * @returns A Blob containing the data within the given Blob starting at
   *          <code>start</code> and ending at <code>end - 1</code>.
   */
  private slice(blob: Blob, start: number, end: number): Blob {
    // TODO Review slice implementation commented code block
    // Use prefixed implementations if necessary
    // const sliceImplementation = (
    //   blob.slice
    //   || blob.webkitSlice
    //   || blob.mozSlice
    // ).bind(blob);

    const length = end - start;

    // The old Blob.slice() was length-based (not end-based). Try the
    // length version first, if the two calls are not equivalent.
    if (length !== end) {
      // If the result of the slice() call matches the expected length,
      // trust that result. It must be correct.
      const sliceResult = blob.slice(start, length);
      if (sliceResult.size === length) {
        return sliceResult;
      }
    }

    // Otherwise, use the most-recent standard: end-based slice()
    return blob.slice(start, end);
  }
}

