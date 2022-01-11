import { InstructionElements } from "./instruction";

/**
 * Allocates a new stream, associating it with the name of a stream previously requested by a get
 * instruction. The contents of the stream will be sent later with blob instructions. The full size
 * of the stream need not be known ahead of time.
 *
 * @param object - The index of the object associated with this stream.
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the data being sent.
 * @param name - The name of the stream associated with the object.
 */
export type BodyHandler = (object: number, stream: number, mimetype: string, name: string) => void;

export const body = (object: number, stream: number, mimetype: string, name: string): InstructionElements => ['body', object, stream, mimetype, name]

/**
 * Allocates a new object, associating it with the given arbitrary filesystem metadata. The contents
 * of files and directories within the filesystem will later be sent along streams requested with
 * get instructions or created with put instructions.
 *
 * @param object - The index of the object to allocate.
 * @param name - The name of the filesystem.
 */
export type FilesystemHandler = (object: number, name: string) => void;

export const filesystem = (object: number, name: string): InstructionElements => ['filesystem', object, name];

/**
 * Requests that a new stream be created, providing read access to the object stream having the
 * given name. The requested stream will be created, in response, with a body instruction.
 *
 * Stream names are arbitrary and dictated by the object from which they are requested, with the
 * exception of the root stream of the object itself, which has the reserved name "/". The root
 * stream of the object has the mimetype "application/vnd.glyptodon.guacamole.stream-index+json",
 * and provides a simple JSON map of available stream names to their corresponding mimetypes. If
 * the object contains a hierarchy of streams, some of these streams may also be
 * "application/vnd.glyptodon.guacamole.stream-index+json".
 *
 * For example, the ultimate content of the body stream provided in response to a get request for
 * the root stream of an object containing two text streams, "A" and "B", would be the following:
 *
 * ```
 * {
 *   "A" : "text/plain",
 *   "B" : "text/plain"
 * }
 *```
 *
 * @param object - The index of the object to request a stream from.
 * @param name - The name of the stream being requested from the given object.
 */
export type GetHandler = (object: number, name: string) => void;

export const get = (object: number, name: string): InstructionElements => ['get', object, name];

/**
 * Allocates a new stream, associating it with the given arbitrary object and stream name. The
 * contents of the stream will later be sent with blob instructions.
 *
 * @param object - The index of the object associated with this stream.
 * @param stream - The index of the stream to allocate.
 * @param mimetype - The mimetype of the data being sent.
 * @param name - The name of the stream within the given object to which data is being sent.
 */
export type PutHandler = (object: number, stream: number, mimetype: string, name: string) => void;

export const put = (object: number, stream: number, mimetype: string, name: string): InstructionElements => ['put', object, stream, mimetype, name]

/**
 * Undefines an existing object, allowing its index to be reused by another future object. The
 * resource associated with the original object may or may not continue to exist - it simply no
 * longer has an associated object.
 *
 * @param object - The index of the object to undefine.
 */
export type UndefineHandler = (object: number) => void;

export const undefine = (object: number): InstructionElements => ['undefine', object];
