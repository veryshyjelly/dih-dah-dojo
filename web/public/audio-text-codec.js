// AudioWorkletGlobalScope omits the text codecs used by wasm-bindgen's string ABI.
// Codec work runs only during module loading/preparation, outside sample rendering.
if (typeof globalThis.TextEncoder === 'undefined')
  globalThis.TextEncoder = class {
    encodeInto(text, destination) {
      let read = 0,
        written = 0;
      for (const value of text) {
        let cp = value.codePointAt(0);
        if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
        const bytes =
          cp < 0x80
            ? [cp]
            : cp < 0x800
              ? [0xc0 | (cp >> 6), 0x80 | (cp & 63)]
              : cp < 0x10000
                ? [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)]
                : [
                    0xf0 | (cp >> 18),
                    0x80 | ((cp >> 12) & 63),
                    0x80 | ((cp >> 6) & 63),
                    0x80 | (cp & 63),
                  ];
        if (written + bytes.length > destination.length) break;
        for (const byte of bytes) destination[written++] = byte;
        read += value.length;
      }
      return { read, written };
    }
    encode(text = '') {
      const bytes = new Uint8Array(text.length * 3);
      const { written } = this.encodeInto(text, bytes);
      return bytes.slice(0, written);
    }
  };
if (typeof globalThis.TextDecoder === 'undefined')
  globalThis.TextDecoder = class {
    decode(bytes = new Uint8Array()) {
      let text = '';
      for (let i = 0; i < bytes.length;) {
        const a = bytes[i++];
        let cp = a;
        if (a >= 0xf0)
          cp =
            ((a & 7) << 18) |
            ((bytes[i++] & 63) << 12) |
            ((bytes[i++] & 63) << 6) |
            (bytes[i++] & 63);
        else if (a >= 0xe0) cp = ((a & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        else if (a >= 0xc0) cp = ((a & 31) << 6) | (bytes[i++] & 63);
        text += String.fromCodePoint(cp);
      }
      return text;
    }
  };
