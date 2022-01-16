import { Streaming } from '@guacamole-client/protocol';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from './streams/input';
import { AudioPlayer, getAudioPlayerInstance } from '@guacamole-client/media';
import { InputStream, StreamError } from '@guacamole-client/io';
import { StatusCode } from './status';
import { InstructionRouter } from './instruction-router';
import { ClientEventTargetMap } from './client-events';

export interface AudioInstructionHandler {
  handleAudioInstruction(streamIndex: number, mimetype: string): void;
}

export interface AudioPlayerStreamHandler extends AudioInstructionHandler, InputStreamHandler {
}

/**
 * Fired when a audio stream is created. The stream provided to this event
 * handler will contain its own event handlers for received data.
 *
 * @param stream - The stream that will receive audio data from the server.
 * @param mimetype - The mimetype of the audio data which will be received.
 *
 * @return An object which implements the AudioPlayer interface and
 *     has been initialized to play the data in the provided stream, or null
 *     if the built-in audio players of the Guacamole client should be
 *     used.
 */
export type OnAudioCallback = (stream: InputStream, mimetype: string) => AudioPlayer;

export class AudioPlayerManager implements AudioPlayerStreamHandler {

  private readonly inputStreams: InputStreamsManager;

  /**
   * All audio players currently in use by the client. Initially, this will
   * be empty, but audio players may be allocated by the server upon request.
   *
   * @private
   */
  private readonly audioPlayers: Map<number, AudioPlayer> = new Map();

  constructor(
    private readonly sender: InputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  // Synchronize all audio players
  sync(): void {
    for (const [_, audioPlayer] of this.audioPlayers) {
      if (!audioPlayer) {
        continue;
      }

      audioPlayer.sync();
    }
  }

  handleAudioInstruction(streamIndex: number, mimetype: string) {
    const stream = this.inputStreams.createStream(streamIndex);

    // Get player instance via callback
    let audioPlayer: AudioPlayer | null = null;

    const listener = this.events.getEventListener('onaudio');
    if (listener) {
      audioPlayer = listener(stream, mimetype);
    }

    // If unsuccessful, try to use a default implementation
    if (!audioPlayer) {
      audioPlayer = getAudioPlayerInstance(stream, mimetype);
    }

    if (!audioPlayer) {
      // Mimetype must be unsupported
      this.inputStreams.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
      return;
    }

    // If we have successfully retrieved an audio player, send success response
    this.audioPlayers.set(streamIndex, audioPlayer);
    this.inputStreams.sendAck(streamIndex);
  }

  handleBlobInstruction(streamIndex: number, data: string) {
    this.inputStreams.handleBlobInstruction(streamIndex, data);
  }

  handleEndInstruction(streamIndex: number) {
    this.inputStreams.handleEndInstruction(streamIndex);
  }
}

export function registerAudioPlayerHandlers(router: InstructionRouter, handler: AudioPlayerStreamHandler) {
  router.addInstructionHandler(Streaming.audio.opcode, Streaming.audio.parser(
    handler.handleAudioInstruction.bind(handler)  // TODO: Review this bind()
  ));
  registerInputStreamHandlers(router, handler);
}
