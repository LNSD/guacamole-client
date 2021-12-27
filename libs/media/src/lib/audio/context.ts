/**
 * Maintains a singleton instance of the Web Audio API AudioContext class,
 * instantiating the AudioContext only in response to the first call to
 * getAudioContext(), and only if no existing AudioContext instance has been
 * provided via the singleton property. Subsequent calls to getAudioContext()
 * will return the same instance.
 */
// TODO Review this lint suppression
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class AudioContextFactory {
  /**
   * A singleton instance of a Web Audio API AudioContext object, or null if
   * no instance has yes been created. This property may be manually set if
   * you wish to supply your own AudioContext instance, but care must be
   * taken to do so as early as possible. Assignments to this property will
   * not retroactively affect the value returned by previous calls to
   * getAudioContext().
   */
  private static singleton: AudioContext | null = null;

  /**
   * Returns a singleton instance of a Web Audio API AudioContext object.
   *
   * @return A singleton instance of a Web Audio API AudioContext object, or null if the Web Audio
   *         API is not supported.
   */
  // TODO Review this lint suppression
  // eslint-disable-next-line @typescript-eslint/member-ordering
  public static getAudioContext(): AudioContext | null {
    // Fallback to Webkit-specific AudioContext implementation
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const AudioContext = window.AudioContext;

    if (!AudioContext) {
      // Web Audio API not supported
      return null;
    }

    // Get new AudioContext instance if Web Audio API is supported
    try {
      // Create new instance if none yet exists
      if (!AudioContextFactory.singleton) {
        AudioContextFactory.singleton = new AudioContext();
      }

      // Return singleton instance
      return AudioContextFactory.singleton;
    } catch (_: unknown) {
      // Do not use Web Audio API if not allowed by browser
      return null;
    }
  }
}
