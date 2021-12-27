export type TaskHandler = () => void;

/**
 * A container for an task handler. Each operation which must be ordered
 * is associated with a Task that goes into a task queue. Tasks in this
 * queue are executed in order once their handlers are set, while Tasks
 * without handlers block themselves and any following Tasks from running.
 *
 * @constructor
 * @private
 * @param {function} taskHandler The function to call when this task
 *                               runs, if any.
 * @param {boolean} blocked Whether this task should start blocked.
 */
export default class Task {
  /**
   * Whether this Task is blocked.
   */
  public blocked: boolean;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(private readonly taskHandler: TaskHandler, blocked: boolean, private readonly __flushFrames: Function) {
    this.blocked = blocked;
  }

  /**
   * Unblocks this Task, allowing it to run.
   */
  public unblock() {
    if (this.blocked) {
      this.blocked = false;
      this.__flushFrames();
    }
  }

  /**
   * Calls the handler associated with this task IMMEDIATELY. This
   * function does not track whether this task is marked as blocked.
   * Enforcing the blocked status of tasks is up to the caller.
   */
  public execute() {
    this.taskHandler();
  }
}
