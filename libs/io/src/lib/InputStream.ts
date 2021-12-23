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

export type OnBlobCallback = (data: string) => void;
export type OnEndCallback = () => void;

/**
 * An input stream abstraction used by the Guacamole client to facilitate
 * transfer of files or other binary data.
 */
export default class InputStream {
  /**
   * The index of this stream.
   */
  public index: number;

  /**
   * Called when a blob of data is received.
   *
   * @event
   * @param {String} data The received base64 data.
   */
  public onblob: OnBlobCallback | null = null;

  /**
   * Called when this stream is closed.
   *
   * @event
   */
  public onend: OnEndCallback | null = null;

  /*
   * @constructor
   * @param {Client} client The client owning this stream.
   * @param {Number} index The index of this stream.
   */
  constructor(private readonly client: any /* TODO Client */, index: number) {
    this.index = index;
  }

  /**
   * Acknowledges the receipt of a blob.
   *
   * @param {String} message A human-readable message describing the error
   *                         or status.
   * @param {Number} code The error code, if any, or 0 for success.
   */
  public sendAck(message: string, code: number) {
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.client.sendAck(this.index, message, code);
  }
}
