/**
 * Integer pool which returns consistently increasing integers while integers
 * are in use, and previously-used integers when possible.
 */
export class IntegerPool {
  /**
   * Array of available integers.
   *
   * @private
   */
  private pool: number[] = [];

  /**
   * The next integer to return if no more integers remain.
   */
  private nextInt = 0;

  /**
   * Returns the next available integer in the pool. If possible, a previously
   * used integer will be returned.
   *
   * @return The next available integer.
   */
  public next(): number {
    // If freed integers exist, return one of those
    const freedInt = this.pool.shift();
    if (freedInt) {
      return freedInt;
    }

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
