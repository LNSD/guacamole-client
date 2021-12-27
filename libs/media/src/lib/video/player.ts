import { InputStream } from "@guacamole-client/io";

/**
 * Abstract video player which accepts, queues and plays back arbitrary video
 * data. It is up to implementations of this class to provide some means of
 * handling a provided InputStream and rendering the received data to
 * the provided Display.VisibleLayer. Data received along the
 * provided stream is to be played back immediately.
 */
export default abstract class VideoPlayer {
  /**
   * Determines whether the given mimetype is supported by any built-in
   * implementation of VideoPlayer, and thus will be properly handled
   * by VideoPlayer.getInstance().
   *
   * @param mimetype - The mimetype to check.
   *
   * @returns true if the given mimetype is supported by any built-in
   *     `    VideoPlayer, false otherwise.
   */
  public static isSupportedType(mimetype: string): boolean {
    // There are currently no built-in video players (and therefore no
    // supported types)
    return false;
  }

  /**
   * Returns a list of all mimetypes supported by any built-in
   * VideoPlayer, in rough order of priority. Beware that only the core
   * mimetypes themselves will be listed. Any mimetype parameters, even required
   * ones, will not be included in the list.
   *
   * @returns A list of all mimetypes supported by any built-in VideoPlayer,
   *          excluding any parameters.
   */
  public static getSupportedTypes(): string[] {
    // There are currently no built-in video players (and therefore no
    // supported types)
    return [];
  }

  /**
   * Returns an instance of VideoPlayer providing support for the given
   * video format. If support for the given video format is not available, null
   * is returned.
   *
   * @param stream - The InputStream to read video data from.
   * @param layer - The destination layer in which this VideoPlayer should play
   *                the received video data.
   * @param mimetype - The mimetype of the video data in the provided stream.
   *
   * @return A VideoPlayer instance supporting the given mimetype and reading
   *         from the given stream, or null if support for the given mimetype
   *         is absent.
   */
  public static getInstance(stream: InputStream, layer: any /* TODO VisibleLayer */, mimetype: string): VideoPlayer | null {
    // There are currently no built-in video players
    return null;
  }

  /**
   * Notifies this VideoPlayer that all video up to the current
   * point in time has been given via the underlying stream, and that any
   * difference in time between queued video data and the current time can be
   * considered latency.
   */
  public sync() {
    // Default implementation - do nothing
  }
}
