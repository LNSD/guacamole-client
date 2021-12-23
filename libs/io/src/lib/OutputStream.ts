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

import {Status} from './Status';

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
