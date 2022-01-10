import InputStream from './InputStream';
import {BlobBuilder} from './polyfill/blob-builder';

export type OnProgressCallback = (length: number) => void;
export type OnEndCallback = () => void;

/**
 * A reader which automatically handles the given input stream, assembling all
 * received blobs into a single blob by appending them to each other in order.
 * Note that this object will overwrite any installed event handlers on the
 * given InputStream.
 */
export default class BlobReader {
  /**
   * Fired once for every blob of data received.
   *
   * @event
   * @param {Number} length The number of bytes received.
   */
  public onprogress: OnProgressCallback | null = null;

  /**
   * Fired once this stream is finished and no further data will be written.
   * @event
   */
  public onend: OnEndCallback | null = null;

  /**
   * The length of this InputStream in bytes.
   * @private
   */
  private length = 0;

  // TODO Review this
  private readonly blobBuilder: BlobBuilder;

  /*
   * @constructor
   * @param {InputStream} stream The stream that data will be read
   *                                       from.
   * @param {String} mimetype The mimetype of the blob being built.
   */
  constructor(stream: InputStream, _mimetype: string /* TODO Review this */) {
    this.blobBuilder = new BlobBuilder();

    // TODO Review this
    // Get blob builder
    // if (window.BlobBuilder) {
    // 	blobBuilder = new window.BlobBuilder();
    // } else if (window.WebKitBlobBuilder) {
    // 	blobBuilder = new window.WebKitBlobBuilder();
    // } else if (window.MozBlobBuilder) {
    // 	blobBuilder = new window.MozBlobBuilder();
    // } else {
    // 	blobBuilder = new class {
    // 		private readonly blobs: Blob[] = [];
    //
    // 		/** @ignore */
    // 		append(data) {
    // 			this.blobs.push(new Blob([data], {type: mimetype}));
    // 		}
    //
    // 		/** @ignore */
    // 		getBlob() {
    // 			return new Blob(this.blobs, {type: mimetype});
    // 		}
    // 	}();
    // }

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
   * @return {Number} The current length of this InputStream.
   */
  getLength(): number {
    return this.length;
  }

  /**
   * Returns the contents of this BlobReader as a Blob.
   * @return {Blob} The contents of this BlobReader.
   */
  getBlob(): Blob {
    return this.blobBuilder.getBlob();
  }
}
