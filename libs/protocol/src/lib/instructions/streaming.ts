type Instruction = any[];

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
export const ack = (stream: number, message: string, status: string): Instruction => ['ack', stream, message, status];


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
export const argv = (stream: number, mimetype: string, name: string): Instruction => ['argv', stream, mimetype, name];


/**
 * Allocates a new stream, associating it with the given audio metadata. Audio data will later be
 * sent along the stream with blob instructions. The mimetype given must be a mimetype previously
 * specified by the client during the handshake procedure. Playback will begin immediately and will
 * continue as long as blobs are received along the stream.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the audio data being sent.
 */
export const audio = (stream: number, mimetype: string): Instruction => ['audio', stream, mimetype];

/**
 * Sends a blob of data along the given stream. This blob of data is arbitrary, base64-encoded data,
 * and only has meaning to the Guacamole client or server through the metadata assigned to the
 * stream when the stream was allocated.
 *
 * @param stream - The index of the stream along which the given data should be sent.
 * @param data - The base64-encoded data to send.
 */
export const blob = (stream: number, data: string): Instruction => ['blob', stream, data];

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
const clipboard = (stream: number, mimetype: string): Instruction => ['clipboard', stream, mimetype];


/**
 * The end instruction terminates an open stream, freeing any client-side or server-side resources.
 * Data sent to a terminated stream will be ignored. Terminating a stream with the end instruction
 * only denotes the end of the stream and does not imply an error.
 *
 * @param stream - The index of the stream the corresponding blob was received on.
 */
const end = (stream: number): Instruction => ['end', stream];


/**
 * Allocates a new stream, associating it with the given arbitrary file metadata. The contents of
 * the file will later be sent along the stream with blob instructions. The full size of the file
 * need not be known ahead of time.
 *
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the file being sent.
 * @param filename - The name of the file, as it would be saved on a filesystem.
 */
const file = (stream: number, mimetype: string, filename: string): Instruction => ['file', stream, mimetype, filename];


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
const img = (stream: number, mimetype: string, mask: string, layer: number, x: number, y: number): Instruction => ['img', stream, mimetype, mask, layer, x, y];


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
const pipe = (stream: number, mimetype: string, name: string): Instruction => ['pipe', stream, mimetype, name];


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
const video = (stream: number, layer: number, mimetype: string): Instruction => ['video', stream, layer, mimetype];
