import { parseAudioMimeType } from './format';

describe('pcm/format', () => {
  describe('parseMimeType', () => {
    it('should parse audio/L8 PCM mime type', () => {
      /* Given */
      const mimetype = 'audio/L8;rate=44100,channels=2';

      /* When */
      const format = parseAudioMimeType(mimetype);

      /* Then */
      expect(format).not.toBeNull();
      if (format !== null) {
        expect(format.bytesPerSample).toBe(1);
        expect(format.rate).toBe(44100);
        expect(format.channels).toBe(2);
      }
    });

    it('should parse audio/L16 PCM mime type', () => {
      /* Given */
      const mimetype = 'audio/L16;rate=44100,channels=1';

      /* When */
      const format = parseAudioMimeType(mimetype);

      /* Then */
      expect(format).not.toBeNull();
      if (format !== null) {
        expect(format.bytesPerSample).toBe(2);
        expect(format.rate).toBe(44100);
        expect(format.channels).toBe(1);
      }
    });

    it('should fail if mime type is not supported', () => {
      /* Given */
      const mimetype = 'anything/L8;rate=44100,channels=2';

      /* When */
      const format = parseAudioMimeType(mimetype);

      /* Then */
      expect(format).toBeNull();
    });
  });

  it('should return null since rate is required', () => {
    /* Given */
    const mimetype = 'audio/L16;channels=1';

    /* When */
    const format = parseAudioMimeType(mimetype);

    /* Then */
    expect(format).toBeNull();
  });

  it('should return null with wrong formatted parameters', () => {
    /* Given */
    const mimetype = 'audio/L16;rate=44100,channels';

    /* When */
    const format = parseAudioMimeType(mimetype);

    /* Then */
    expect(format).toBeNull();
  });

  it('should return null with wrong formatted parameters', () => {
    /* Given */
    const mimetype = 'audio/L16;rate=44100,channels';

    /* When */
    const format = parseAudioMimeType(mimetype);

    /* Then */
    expect(format).toBeNull();
  });

  it('should return null with unknown parameters', () => {
    /* Given */
    const mimetype = 'audio/L16;rate=44100,color=rgb';

    /* When */
    const format = parseAudioMimeType(mimetype);

    /* Then */
    expect(format).toBeNull();
  });
});
