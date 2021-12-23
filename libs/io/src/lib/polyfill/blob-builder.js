// TODO Check https://github.com/eligrey/Blob.js/blob/master/Blob.js

/**
 * @author www.tutorialspots.com
 * @copyright 2019
 */

export class BlobBuilder {
  constructor() {
    this.blob = new Blob();
  }

  append(data, endings) {
    endings = endings || 'transparent';
    if (this.blob.size === 0) {
      this.blob = new Blob([data], {endings});
    } else {
      this.blob = new Blob([this.blob, data], {endings});
    }
  }

  getBlob(contentType) {
    if (contentType !== undefined) {
      this.blob.type = contentType;
    }

    return this.blob;
  }

  getFile(name, contentType) {
    if (contentType !== undefined) {
      return new File(this.blob, name, {type: contentType});
    }

    return new File(this.blob, name);
  }
}
