export type OnCloseCallback = () => void;
export type OnErrorCallback = () => void;

/**
 * Abstract audio recorder which streams arbitrary audio data to an underlying
 * OutputStream. It is up to implementations of this class to provide
 * some means of handling this OutputStream. Data produced by the
 * recorder is to be sent along the provided stream immediately.
 *
 * @constructor
 */
export default abstract class AudioRecorder {
  /**
   * Callback which is invoked when the audio recording process has stopped
   * and the underlying Guacamole stream has been closed normally. Audio will
   * only resume recording if a new AudioRecorder is started. This
   * AudioRecorder instance MAY NOT be reused.
   *
   * @event
   */
  public onclose: OnCloseCallback | null = null;

  /**
   * Callback which is invoked when the audio recording process cannot
   * continue due to an error, if it has started at all. The underlying
   * Guacamole stream is automatically closed. Future attempts to record
   * audio should not be made, and this AudioRecorder instance
   * MAY NOT be reused.
   *
   * @event
   */
  public onerror: OnErrorCallback | null = null;
}
