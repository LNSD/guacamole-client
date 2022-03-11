import Task from './task';

/**
 * An ordered list of tasks which must be executed atomically. Once
 * executed, an associated (and optional) callback will be called.
 */
export default class Frame {
  /*
   * @constructor
   * @param {function} callback The function to call when this frame is
   *                            rendered.
   * @param {Task[]} tasks The set of tasks which must be executed to render
   *                       this frame.
   */
  constructor(
    private readonly callback: () => void,
    private readonly tasks: Task[],
  ) {}

  /**
   * Returns whether this frame is ready to be rendered. This function
   * returns true if and only if ALL underlying tasks are unblocked.
   *
   * @returns true if all underlying tasks are unblocked,
   *          false otherwise.
   */
  public isReady(): boolean {
    // Search for blocked tasks
    for (const task of this.tasks) {
      if (task.blocked) {
        return false;
      }
    }

    // If no blocked tasks, the frame is ready
    return true;
  }

  /**
   * Renders this frame, calling the associated callback, if any, after
   * the frame is complete. This function MUST only be called when no
   * blocked tasks exist. Calling this function with blocked tasks
   * will result in undefined behavior.
   */
  public flush() {
    // Draw all pending tasks.
    for (const task of this.tasks) {
      task.execute();
    }

    // Call callback
    if (this.callback !== undefined) {
      this.callback();
    }
  }
}
