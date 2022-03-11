import { ArrayBufferReader, InputStream } from '@guacamole-client/io';

import AudioContextFactory from '../context';
import AudioPlayer from '../player';
import { parseAudioMimeType, PcmAudioFormat } from './format';

type SampleArray = Int8Array | Int16Array;

/**
 * The minimum size of an audio packet split by splitAudioPacket(), in
 * seconds. Audio packets smaller than this will not be split, nor will the
 * split result of a larger packet ever be smaller in size than this
 * minimum.
 *
 * @private
 * @constant
 */
const MIN_SPLIT_SIZE = 0.02;

/**
 * Implementation of AudioPlayer providing support for raw PCM format
 * audio. This player relies only on the Web Audio API and does not require any
 * browser-level support for its audio formats.
 */
export default class PcmAudioPlayer extends AudioPlayer {
  /**
   * An instance of a Web Audio API AudioContext object, or null if the
   * Web Audio API is not supported.
   *
   * @private
   */
  private readonly context: AudioContext;
  /**
   * The format of audio this player will decode.
   *
   * @private
   */
  private readonly format: PcmAudioFormat;
  /**
   * The earliest possible time that the next packet could play without
   * overlapping an already-playing packet, in seconds. Note that while this
   * value is in seconds, it is not an integer value and has microsecond
   * resolution.
   *
   * @private
   */
  private nextPacketTime: number;
  /**
   * ArrayBufferReader wrapped around the audio input stream
   * provided with this RawAudioPlayer was created.
   *
   * @private
   */
  private readonly reader: ArrayBufferReader;
  /**
   * The maximum amount of latency to allow between the buffered data stream
   * and the playback position, in seconds. Initially, this is set to
   * roughly one third of a second.
   *
   * @private
   */
  private readonly maxLatency = 0.3;
  /**
   * The queue of all pending audio packets, as an array of sample arrays.
   * Audio packets which are pending playback will be added to this queue for
   * further manipulation prior to scheduling via the Web Audio API. Once an
   * audio packet leaves this queue and is scheduled via the Web Audio API,
   * no further modifications can be made to that packet.
   *
   * @private
   */
  private packetQueue: SampleArray[] = [];

  /*
   * @constructor
   * @param stream - The InputStream to read audio data from.
   * @param mimetype - The mimetype of the audio data in the provided stream, which must be a
   *    "audio/L8" or "audio/L16" mimetype with necessary parameters, such as:
   *    "audio/L16;rate=44100,channels=2".
   */
  constructor(stream: InputStream, mimetype: string) {
    super();

    const context = AudioContextFactory.getAudioContext();
    if (context === null) {
      throw new Error('Audio context not supported');
    }
    this.context = context;

    const format = parseAudioMimeType(mimetype);
    if (format === null) {
      throw new Error('Audio format not supported');
    }
    this.format = format;

    this.nextPacketTime = this.context.currentTime;
    this.reader = new ArrayBufferReader(stream);

    // Defer playback of received audio packets slightly
    this.reader.ondata = (data: ArrayBuffer) => {
      // Push received samples onto queue
      this.pushAudioPacket(new this.SampleArray(data));

      // Shift off an arbitrary packet of audio data from the queue (this may
      // be different in size from the packet just pushed)
      const packet = this.shiftAudioPacket();
      if (packet === null) {
        return;
      }

      // Determine exactly when packet CAN play
      const packetTime = context.currentTime;
      if (this.nextPacketTime < packetTime) {
        this.nextPacketTime = packetTime;
      }

      // Set up buffer source
      const source = context.createBufferSource();
      source.connect(context.destination);

      // Schedule packet
      source.buffer = this.toAudioBuffer(packet);
      source.start(this.nextPacketTime);

      // Update timeline by duration of scheduled packet
      this.nextPacketTime += packet.length / format.channels / format.rate;
    };
  }

  /**
   * The type of typed array that will be used to represent each audio packet
   * internally. This will be either Int8Array or Int16Array, depending on
   * whether the raw audio format is 8-bit or 16-bit.
   *
   * @private
   * @constructor
   */
  private get SampleArray() {
    return this.format.bytesPerSample === 1
      ? window.Int8Array
      : window.Int16Array;
  }

  /**
   * Determines whether the given mimetype is supported by
   * RawAudioPlayer.
   *
   * @param mimetype - The mimetype to check.
   *
   * @returns true if the given mimetype is supported by RawAudioPlayer,
   *          false otherwise.
   */
  public static isSupportedType(mimetype: string): boolean {
    // No supported types if no Web Audio API
    if (!AudioContextFactory.getAudioContext()) {
      return false;
    }

    return parseAudioMimeType(mimetype) !== null;
  }

  /**
   * Returns a list of all mimetypes supported by RawAudioPlayer. Only
   * the core mimetypes themselves will be listed. Any mimetype parameters, even
   * required ones, will not be included in the list. For example, "audio/L8" is
   * a raw audio mimetype that may be supported, but it is invalid without
   * additional parameters. Something like "audio/L8;rate=44100" would be valid,
   * however (see https://tools.ietf.org/html/rfc4856).
   *
   * @returns A list of all mimetypes supported by RawAudioPlayer, excluding
   *     any parameters. If the necessary JavaScript APIs for playing raw audio
   *     are absent, this list will be empty.
   */
  public static getSupportedTypes(): string[] {
    // No supported types if no Web Audio API
    if (!AudioContextFactory.getAudioContext()) {
      return [];
    }

    // We support 8-bit and 16-bit raw PCM
    return ['audio/L8', 'audio/L16'];
  }

  /** @override */
  public sync() {
    // Calculate elapsed time since last sync
    const now = this.context.currentTime;

    // Reschedule future playback time such that playback latency is
    // bounded within a reasonable latency threshold
    this.nextPacketTime = Math.min(this.nextPacketTime, now + this.maxLatency);
  }

  /**
   * Given an array of audio packets, returns a single audio packet containing
   * the concatenation of those packets.
   *
   * @private
   * @param packets - The array of audio packets to concatenate.
   *
   * @returns A single audio packet containing the concatenation of all given
   *          audio packets. If no packets are provided, this will be undefined.
   */
  private joinAudioPackets(packets: SampleArray[]): SampleArray {
    // Do not bother joining if one or fewer packets are in the queue
    if (packets.length <= 1) {
      return packets[0];
    }

    // Determine total sample length of the entire queue
    let totalLength = 0;
    packets.forEach((packet) => {
      totalLength += packet.length;
    });

    // Append each packet within queue
    let offset = 0;
    const joined = new this.SampleArray(totalLength);
    packets.forEach((packet) => {
      joined.set(packet, offset);
      offset += packet.length;
    });

    return joined;
  }

  /**
   * Given a single packet of audio data, splits off an arbitrary length of
   * audio data from the beginning of that packet, returning the split result
   * as an array of two packets. The split location is determined through an
   * algorithm intended to minimize the likelihood of audible clicking between
   * packets. If no such split location is possible, an array containing only
   * the originally-provided audio packet is returned.
   *
   * @private
   * @param data - The audio packet to split.
   *
   * @returns An array of audio packets containing the result of splitting the
   *          provided audio packet. If splitting is possible, this array will
   *          contain two packets. If splitting is not possible, this array will
   *          contain only the originally-provided packet.
   */
  private splitAudioPacket(data: SampleArray): SampleArray[] {
    let minValue = Number.MAX_VALUE;
    let optimalSplitLength = data.length;

    // Calculate number of whole samples in the provided audio packet AND
    // in the minimum possible split packet
    const samples = Math.floor(data.length / this.format.channels);
    const minSplitSamples = Math.floor(this.format.rate * MIN_SPLIT_SIZE);

    // Calculate the beginning of the "end" of the audio packet
    const start = Math.max(
      this.format.channels * minSplitSamples,
      this.format.channels * (samples - minSplitSamples),
    );

    // For all samples at the end of the given packet, find a point where
    // the perceptible volume across all channels is lowest (and thus is
    // the optimal point to split)
    for (
      let offset = start;
      offset < data.length;
      offset += this.format.channels
    ) {
      // Calculate the sum of all values across all channels (the result
      // will be proportional to the average volume of a sample)
      let totalValue = 0;
      for (let channel = 0; channel < this.format.channels; channel++) {
        totalValue += Math.abs(data[offset + channel]);
      }

      // If this is the smallest average value thus far, set the split
      // length such that the first packet ends with the current sample
      if (totalValue <= minValue) {
        optimalSplitLength = offset + this.format.channels;
        minValue = totalValue;
      }
    }

    // If packet is not split, return the supplied packet untouched
    if (optimalSplitLength === data.length) {
      return [data];
    }

    // Otherwise, split the packet into two new packets according to the
    // calculated optimal split length
    return [
      new this.SampleArray(
        data.buffer.slice(0, optimalSplitLength * this.format.bytesPerSample),
      ),
      new this.SampleArray(
        data.buffer.slice(optimalSplitLength * this.format.bytesPerSample),
      ),
    ];
  }

  /**
   * Pushes the given packet of audio data onto the playback queue. Unlike
   * other private functions within RawAudioPlayer, the type of the
   * ArrayBuffer packet of audio data here need not be specific to the type
   * of audio (as with SampleArray). The ArrayBuffer type provided by a
   * ArrayBufferReader, for example, is sufficient. Any necessary
   * conversions will be performed automatically internally.
   *
   * @private
   * @param data - A raw packet of audio data that should be pushed onto the
   *               audio playback queue.
   */
  private pushAudioPacket(data: ArrayBuffer) {
    this.packetQueue.push(new this.SampleArray(data));
  }

  /**
   * Shifts off and returns a packet of audio data from the beginning of the
   * playback queue. The length of this audio packet is determined
   * dynamically according to the click-reduction algorithm implemented by
   * splitAudioPacket().
   *
   * @private
   * @returns A packet of audio data pulled from the beginning of the playback
   *          queue.
   */
  private shiftAudioPacket(): SampleArray | null {
    // Flatten data in packet queue
    const data = this.joinAudioPackets(this.packetQueue);
    if (!data) {
      return null;
    }

    // Pull an appropriate amount of data from the front of the queue
    this.packetQueue = this.splitAudioPacket(data);
    const data2 = this.packetQueue.shift();
    if (!data2) {
      return null;
    }

    return data2;
  }

  /**
   * Converts the given audio packet into an AudioBuffer, ready for playback
   * by the Web Audio API. Unlike the raw audio packets received by this
   * audio player, AudioBuffers require floating point samples and are split
   * into isolated planes of channel-specific data.
   *
   * @private
   * @param data
   *     The raw audio packet that should be converted into a Web Audio API
   *     AudioBuffer.
   *
   * @returns
   *     A new Web Audio API AudioBuffer containing the provided audio data,
   *     converted to the format used by the Web Audio API.
   */
  private toAudioBuffer(data: SampleArray): AudioBuffer {
    // Calculate total number of samples
    const samples = data.length / this.format.channels;

    // Determine exactly when packet CAN play
    const packetTime = this.context.currentTime;
    if (this.nextPacketTime < packetTime) {
      this.nextPacketTime = packetTime;
    }

    // Get audio buffer for specified format
    const audioBuffer = this.context.createBuffer(
      this.format.channels,
      samples,
      this.format.rate,
    );

    // Normalize each channel
    for (let channel = 0; channel < this.format.channels; channel++) {
      const audioData = audioBuffer.getChannelData(channel);

      // Fill audio buffer with data for channel
      let offset = channel;
      for (let i = 0; i < samples; i++) {
        audioData[i] = data[offset] / this.format.maxSampleValue;
        offset += this.format.channels;
      }
    }

    return audioBuffer;
  }
}
