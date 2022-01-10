import { IntegerPool } from './IntegerPool';

describe('IntegerPool', () => {
  it('should provide a sequence of integers', () => {
    /* Given */
    const pool = new IntegerPool();

    /* When */
    const first = pool.next();
    const second = pool.next();
    const third = pool.next();

    /* Then */
    expect(first).toBe(0);
    expect(second).toBe(1);
    expect(third).toBe(2);
  });

  it('should free an integer and add it to the pool', () => {
    /* Given */
    const pool = new IntegerPool();
    const first = pool.next();
    const second = pool.next();
    const third = pool.next();

    /* When */
    pool.free(second);
    pool.free(third);
    const fourth = pool.next();

    /* Then */
    expect(second).toBe(1);
    expect(fourth).toBe(1);
  });
});
