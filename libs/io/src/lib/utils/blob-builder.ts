export class BlobBuilder {
  private blob: Blob;

  constructor() {
    this.blob = new Blob();
  }

  append(data: BlobPart, endings?: EndingType) {
    endings = endings ?? 'transparent';

    const blobParts = this.blob.size !== 0 ? [this.blob, data] : [data];
    this.blob = new Blob(blobParts, { endings });
  }

  getBlob(contentType?: string) {
    if (contentType !== undefined) {
      return new Blob([this.blob], { type: contentType });
    }

    return this.blob;
  }

  getFile(name: string, contentType?: string) {
    let options;
    if (contentType !== undefined) {
      options = { type: contentType };
    }

    return new File([this.blob], name, options);
  }
}
