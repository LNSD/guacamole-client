/**
 * A description of the format of raw PCM audio, such as that used by
 * PcmAudioPlayer and PcmAudioRecorder. This object
 * describes the number of bytes per sample, the number of channels, and the
 * overall sample rate.
 */
export class PcmAudioFormat {
  /**
   * The number of bytes in each sample of audio data. This value is
   * independent of the number of channels.
   */
  public bytesPerSample: number;

  /**
   * The number of audio channels (ie: 1 for mono, 2 for stereo).
   */
  public channels: number;

  /**
   * The number of samples per second, per channel.
   */
  public rate: number;

  /*
   * @constructor
   * @param template - The object whose properties should be copied into the
   *                   corresponding properties of the new RawAudioFormat.
   */
  constructor(template: PcmAudioFormat) {
    this.bytesPerSample = template.bytesPerSample;
    this.channels = template.channels;
    this.rate = template.rate;
  }
}

/**
 * Parses the given mimetype, returning a new RawAudioFormat
 * which describes the type of raw audio data represented by that mimetype. If
 * the mimetype is not a supported raw audio data mimetype, null is returned.
 *
 * @param mimetype - The audio mimetype to parse.
 *
 * @returns A new RawAudioFormat which describes the type of raw audio data
 *          represented by the given mimetype, or null if the given mimetype
 *          is not supported.
 */
export function parseAudioMimeType(mimetype: string): PcmAudioFormat | null {
  let bytesPerSample: number;

  // Rate is absolutely required - if null is still present later, the
  // mimetype must not be supported
  let rate: number | null = null;

  // Default for both "audio/L8" and "audio/L16" is one channel
  let channels = 1;

  // "audio/L8" has one byte per sample
  if (mimetype.startsWith('audio/L8;')) {
    mimetype = mimetype.substring(9);
    bytesPerSample = 1;
  } else if (mimetype.startsWith('audio/L16;')) {
    // "audio/L16" has two bytes per sample
    mimetype = mimetype.substring(10);
    bytesPerSample = 2;
  } else {
    // All other types are unsupported
    return null;
  }

  // Parse all parameters
  const parameters = mimetype.split(',');

  for (const parameter of parameters) {
    // All parameters must have an equals sign separating name from value
    const equals = parameter.indexOf('=');
    if (equals === -1) {
      return null;
    }

    // Parse name and value from parameter string
    const name = parameter.substring(0, equals);
    const value = parameter.substring(equals + 1);

    // Handle each supported parameter
    switch (name) {
      // Number of audio channels
      case 'channels':
        channels = parseInt(value, 10);
        break;

      // Sample rate
      case 'rate':
        rate = parseInt(value, 10);
        break;

      // All other parameters are unsupported
      default:
        return null;
    }
  }

  // The rate parameter is required
  if (rate === null) {
    return null;
  }

  // Return parsed format details
  return new PcmAudioFormat({
    bytesPerSample,
    channels,
    rate,
  })
}
