import { InputStream } from './InputStream';
import { BlobBuilder } from './utils/blob-builder';

export type OnProgressCallback = (length: number) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, assembling all
 * received blobs into a single blob by appending them to each other in order.
 *
 * Note that this object will overwrite any installed event handlers on the
 * given InputStream.
 */
export class BlobReader {
  /**
   * Fired once for every blob of data received.
   *
   * @param length - The number of bytes received.
   */
  public onprogress: OnProgressCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  public onend: OnEndCallback | null = null;

  private readonly blobBuilder: BlobBuilder;

  /**
   * The length of this InputStream in bytes.
   *
   * @private
   */
  private length = 0;

  /**
   * @constructor
   *
   * @param stream - The stream that data will be read from.
   * @param mimetype - The mimetype of the blob being built.
   */
  constructor(stream: InputStream, private readonly mimetype: string) {
    this.blobBuilder = new BlobBuilder();

    // Append received blobs
    stream.onblob = data => {
      // Convert to ArrayBuffer
      const binary = atob(data);
      const arrayBuffer = new ArrayBuffer(binary.length);
      const bufferView = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binary.length; i++) {
        bufferView[i] = binary.charCodeAt(i);
      }

      this.blobBuilder.append(arrayBuffer);
      this.length += arrayBuffer.byteLength;

      // Call handler, if present
      if (this.onprogress !== null) {
        this.onprogress(arrayBuffer.byteLength);
      }

      // Send success response
      stream.sendAck('OK', 0x0000);
    };

    // Simply call onend when end received
    stream.onend = () => {
      if (this.onend !== null) {
        this.onend();
      }
    };
  }

  /**
   * Returns the current length of this InputStream, in bytes.
   *
   * @return The current length of this InputStream.
   */
  getLength(): number {
    return this.length;
  }

  /**
   * Returns the contents of this BlobReader as a Blob.
   *
   * @return The contents of this BlobReader.
   */
  getBlob(): Blob {
    return this.blobBuilder.getBlob(this.mimetype);
  }
}
