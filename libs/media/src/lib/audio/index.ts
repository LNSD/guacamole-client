import RawAudioPlayer from "./raw/player";
import { InputStream, OutputStream } from "@guacamole-client/io";
import AudioPlayer from "./player";
import RawAudioRecorder from "./raw/recorder";
import AudioRecorder from "./recorder";

export { default as AudioPlayer } from "./player";
export { default as AudioRecorder } from "./recorder";
export { default as RawAudioPlayer } from "./raw/player";
export { default as RawAudioRecorder } from "./raw/recorder";

/**
 * Determines whether the given mimetype is supported by any built-in
 * implementation of AudioPlayer, and thus will be properly handled
 * by AudioPlayer.getInstance().
 *
 * @param mimetype - The mimetype to check.
 *
 * @returns true if the given mimetype is supported by any built-in
 *          AudioPlayer, false otherwise.
 */
export function isAudioPlayerSupportedMimetype(mimetype: string): boolean {
  return RawAudioPlayer.isSupportedType(mimetype);
}

/**
 * Returns an instance of AudioPlayer providing support for the given
 * audio format. If support for the given audio format is not available, null
 * is returned.
 *
 * @param stream - The InputStream to read audio data from.
 * @param mimetype - The mimetype of the audio data in the provided stream.
 *
 * @return A AudioPlayer instance supporting the given mimetype and
 *         reading from the given stream, or null if support for the given mimetype
 *         is absent.
 */
export function getAudioPlayerInstance(stream: InputStream, mimetype: string): AudioPlayer | null {
  // Use raw audio player if possible
  if (RawAudioPlayer.isSupportedType(mimetype)) {
    return new RawAudioPlayer(stream, mimetype);
  }

  // No support for given mimetype
  return null;
}

/**
 * Returns a list of all mimetypes supported by any built-in
 * AudioPlayer, in rough order of priority. Beware that only the core
 * mimetypes themselves will be listed. Any mimetype parameters, even required
 * ones, will not be included in the list. For example, "audio/L8" is a
 * supported raw audio mimetype that is supported, but it is invalid without
 * additional parameters. Something like "audio/L8;rate=44100" would be valid,
 * however (see https://tools.ietf.org/html/rfc4856).
 *
 * @returns A list of all mimetypes supported by any built-in AudioPlayer,
 *          excluding any parameters.
 */
export function getAudioPlayerSupportedTypes(): string[] {
  return RawAudioPlayer.getSupportedTypes();
}

/**
 * Determines whether the given mimetype is supported by any built-in
 * implementation of AudioRecorder, and thus will be properly handled
 * by AudioRecorder.getInstance().
 *
 * @param mimetype - The mimetype to check.
 *
 * @returns true if the given mimetype is supported by any built-in
 *          AudioRecorder, false otherwise.
 */
export function isAudioRecorderSupportedType(mimetype: string): boolean {
  return RawAudioRecorder.isSupportedType(mimetype);
}

/**
 * Returns a list of all mimetypes supported by any built-in
 * AudioRecorder, in rough order of priority. Beware that only the
 * core mimetypes themselves will be listed. Any mimetype parameters, even
 * required ones, will not be included in the list. For example, "audio/L8" is
 * a supported raw audio mimetype that is supported, but it is invalid without
 * additional parameters. Something like "audio/L8;rate=44100" would be valid,
 * however (see https://tools.ietf.org/html/rfc4856).
 *
 * @returns A list of all mimetypes supported by any built-in
 *          AudioRecorder, excluding any parameters.
 */
export function getAudioRecorderSupportedTypes(): string[] {
  return RawAudioRecorder.getSupportedTypes();
}

/**
 * Returns an instance of AudioRecorder providing support for the
 * given audio format. If support for the given audio format is not available,
 * null is returned.
 *
 * @param {OutputStream} stream
 *     The OutputStream to send audio data through.
 *
 * @param {String} mimetype
 *     The mimetype of the audio data to be sent along the provided stream.
 *
 * @return {AudioRecorder}
 *     A AudioRecorder instance supporting the given mimetype and
 *     writing to the given stream, or null if support for the given mimetype
 *     is absent.
 */
export function getAudioRecorderInstance(stream: OutputStream, mimetype: string): AudioRecorder | null {
  // Use raw audio recorder if possible
  if (RawAudioRecorder.isSupportedType(mimetype)) {
    return new RawAudioRecorder(stream, mimetype);
  }

  // No support for given mimetype
  return null;
}
