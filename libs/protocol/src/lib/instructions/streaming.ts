import { createInstruction, InstructionElements } from './instruction';

// Streaming instructions
const ACK_OPCODE = 'ack';
const ARGV_OPCODE = 'argv';
const AUDIO_OPCODE = 'audio';
const BLOB_OPCODE = 'blob';
const CLIPBOARD_OPCODE = 'clipboard';
const END_OPCODE = 'end';
const FILE_OPCODE = 'file';
const IMG_OPCODE = 'img';
const NEST_OPCODE = 'nest';
const PIPE_OPCODE = 'pipe';
const VIDEO_OPCODE = 'video';

/**
 * The ack instruction acknowledges a received data blob, providing a status code and message
 * indicating whether the operation associated with the blob succeeded or failed. A status code
 * other than SUCCESS implicitly ends the stream.
 *
 * @param stream - The index of the stream the corresponding blob was received on.
 * @param message - A human-readable error message. This typically is not exposed within any user
 *                  interface, and mainly helps with debugging.
 * @param status - The Guacamole status code denoting success or failure.
 */
export type AckHandler = (stream: number, message: string, status: number) => void;

export const ack = createInstruction<AckHandler>(ACK_OPCODE,
  (stream: number, message: string, status: number): InstructionElements => [stream, message, status],
  (params: string[], handler: AckHandler): void => {
    const streamIndex = parseInt(params[0], 10);
    const message = params[1];
    const code = parseInt(params[2], 10);

    handler(streamIndex, message, code);
  }
);

/**
 * Allocates a new stream, associating it with the given argument (connection parameter)
 * metadata. The relevant connection parameter data will later be sent along the stream with blob
 * instructions. If sent by the client, this data will be the desired new value of the connection
 * parameter being changed, and will be applied if the server supports changing that connection
 * parameter while the connection is active. If sent by the server, this data will be the current
 * value of a connection parameter being exposed to the client.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the connection parameter being sent. In most cases,
 *                   this will be "text/plain".
 * @param name - The name of the connection parameter whose value is being sent.
 */
export const argv = (stream: number, mimetype: string, name: string): InstructionElements => [ARGV_OPCODE, stream, mimetype, name];


/**
 * Allocates a new stream, associating it with the given audio metadata. Audio data will later be
 * sent along the stream with blob instructions. The mimetype given must be a mimetype previously
 * specified by the client during the handshake procedure. Playback will begin immediately and will
 * continue as long as blobs are received along the stream.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the audio data being sent.
 */
export const audio = (stream: number, mimetype: string): InstructionElements => [AUDIO_OPCODE, stream, mimetype];

/**
 * Sends a blob of data along the given stream. This blob of data is arbitrary, base64-encoded data,
 * and only has meaning to the Guacamole client or server through the metadata assigned to the
 * stream when the stream was allocated.
 *
 * @param stream - The index of the stream along which the given data should be sent.
 * @param data - The base64-encoded data to send.
 */
export const blob = (stream: number, data: string): InstructionElements => [BLOB_OPCODE, stream, data];

/**
 * Allocates a new stream, associating it with the given clipboard metadata. The clipboard data will
 * later be sent along the stream with blob instructions. If sent by the client, this data will be
 * the contents of the client-side clipboard. If sent by the server, this data will be the contents
 * of the clipboard within the remote desktop.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the clipboard data being sent. In most cases, this will be
 *                   "text/plain".
 */
export const clipboard = (stream: number, mimetype: string): InstructionElements => [CLIPBOARD_OPCODE, stream, mimetype];


/**
 * The end instruction terminates an open stream, freeing any client-side or server-side resources.
 * Data sent to a terminated stream will be ignored. Terminating a stream with the end instruction
 * only denotes the end of the stream and does not imply an error.
 *
 * @param stream - The index of the stream the corresponding blob was received on.
 */
export const end = (stream: number): InstructionElements => [END_OPCODE, stream];


/**
 * Allocates a new stream, associating it with the given arbitrary file metadata. The contents of
 * the file will later be sent along the stream with blob instructions. The full size of the file
 * need not be known ahead of time.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the file being sent.
 * @param filename - The name of the file, as it would be saved on a filesystem.
 */
export const file = (stream: number, mimetype: string, filename: string): InstructionElements => [FILE_OPCODE, stream, mimetype, filename];


/**
 * Allocates a new stream, associating it with the metadata of an image update, including the image
 * type, the destination layer, and destination coordinates. The contents of the image will later be
 * sent along the stream with blob instructions. The full size of the image need not be known ahead
 * of time.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the image being sent.
 * @param mask - The channel mask to apply when drawing the image data.
 * @param layer - The destination layer.
 * @param x - The X coordinate of the upper-left corner of the destination within the destination
 *            layer.
 * @param y - The Y coordinate of the upper-left corner of the destination within the destination
 *            layer.
 */
export const img = (stream: number, mimetype: string, mask: string, layer: number, x: number, y: number): InstructionElements => [IMG_OPCODE, stream, mimetype, mask, layer, x, y];

/**
 * Encodes part of one or more instructions within a single instruction, associating that packet of
 * data with a stream index. Future nest instructions with the same stream index will append their
 * data to the same logical stream on the client side. Once nested data is received on the client
 * side, the client immediately executes any completed instructions within the associated stream,
 * in order.
 *
 * @param index - The index of the stream this data should be appended to. This index is completely
 *                arbitrary, and denotes only how nested data should be reassembled.
 * @param data - The protocol data, containing part of one or more instructions.
 */
export const nest = (index: number, data: string): InstructionElements => [NEST_OPCODE, index, data];

/**
 * Allocates a new stream, associating it with the given arbitrary named pipe metadata. The contents
 * of the pipe will later be sent along the stream with blob instructions. Pipes in the Guacamole
 * protocol are unidirectional, named pipes, very similar to a UNIX FIFO or pipe. It is up to
 * client-side code to handle pipe data appropriately, likely based upon the name of the pipe, which
 * is arbitrary. Pipes may be opened by either the client or the server.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the data being sent along the pipe.
 * @param name - The arbitrary name of the pipe, which may have special meaning to client-side code.
 */
export const pipe = (stream: number, mimetype: string, name: string): InstructionElements => [PIPE_OPCODE, stream, mimetype, name];


/**
 * Allocates a new stream, associating it with the given video metadata. Video data will later be
 * sent along the stream with blob instructions. The mimetype given must be a mimetype previously
 * specified by the client during the handshake procedure. Playback will begin immediately and will
 * continue as long as blobs are received along the stream.
 *
 * @param stream - The index of the stream to allocate.
 * @param layer - The index of the layer to stream the video data into. The effect of other drawing
 *                operations on this layer during playback is undefined, as the client codec
 *                implementation may leverage any rendering mechanism it sees fit, including
 *                hardware decoding.
 * @param mimetype - The mimetype of the video data being sent.
 */
export const video = (stream: number, layer: number, mimetype: string): InstructionElements => [VIDEO_OPCODE, stream, layer, mimetype];
