/**
 * Abstract audio player which accepts, queues and plays back arbitrary audio
 * data. It is up to implementations of this class to provide some means of
 * handling a provided InputStream. Data received along the provided
 * stream is to be played back immediately.
 */
export default abstract class AudioPlayer {
  /**
   * Notifies this AudioPlayer that all audio up to the current
   * point in time has been given via the underlying stream, and that any
   * difference in time between queued audio data and the current time can be
   * considered latency.
   */
  public sync() {
    // Default implementation - do nothing
  }
}
