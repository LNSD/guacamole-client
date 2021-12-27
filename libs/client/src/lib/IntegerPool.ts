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

/**
 * Integer pool which returns consistently increasing integers while integers
 * are in use, and previously-used integers when possible.
 */
export default class IntegerPool {
  /**
   * Array of available integers.
   *
   * @private
   */
  pool: number[] = [];

  /**
   * The next integer to return if no more integers remain.
   */
  nextInt = 0;

  /**
   * Returns the next available integer in the pool. If possible, a previously
   * used integer will be returned.
   *
   * @return The next available integer.
   */
  public next(): number {
    // TODO Review this
    // // If free'd integers exist, return one of those
    // if (this.pool.length > 0) {
    //   this.pool.shift();
    //   return;
    // }

    // Otherwise, return a new integer
    return this.nextInt++;
  }

  /**
   * Frees the given integer, allowing it to be reused.
   *
   * @param integer - The integer to free.
   */
  public free(integer: number) {
    this.pool.push(integer);
  }
}
