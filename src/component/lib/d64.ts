// https://github.com/dominictarr/d64

// Copyright (c) 2014 Dominic Tarr

// Permission is hereby granted, free of charge,
// to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to
// deal in the Software without restriction, including
// without limitation the rights to use, copy, modify,
// merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom
// the Software is furnished to do so,
// subject to the following conditions:

// The above copyright notice and this permission notice
// shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
// OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
// ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const CHARS = ".PYFGCRLAOEUIDHTNSQJKXBMWVZ_pyfgcrlaoeuidhtnsqjkxbmwvz1234567890"
  .split("")
  .sort()
  .join("");

const codeToIndex = new Uint8Array(128);
for (let i = 0; i < CHARS.length; i++) {
  codeToIndex[CHARS.charCodeAt(i)] = i;
}

export function encode(data: ArrayBuffer): string {
  const dataView = new DataView(data);
  let s = "";
  const l = dataView.byteLength;
  let hang = 0;

  for (let i = 0; i < l; i++) {
    const v = dataView.getUint8(i);
    switch (i % 3) {
      case 0:
        s += CHARS[v >> 2];
        hang = (v & 3) << 4;
        break;
      case 1:
        s += CHARS[hang | (v >> 4)];
        hang = (v & 0xf) << 2;
        break;
      case 2:
        s += CHARS[hang | (v >> 6)];
        s += CHARS[v & 0x3f];
        hang = 0;
        break;
    }
  }
  if (l % 3) s += CHARS[hang];
  return s;
}

export function decode(data: string): ArrayBuffer {
  const l = data.length;
  const b = new ArrayBuffer(~~((l / 4) * 3));
  const bView = new DataView(b);
  let hang = 0;
  let j = 0;

  for (let i = 0; i < l; i++) {
    const v = codeToIndex[data.charCodeAt(i)];
    switch (i % 4) {
      case 0:
        hang = v << 2;
        break;
      case 1:
        bView.setUint8(j++, hang | (v >> 4));
        hang = (v << 4) & 0xff;
        break;
      case 2:
        bView.setUint8(j++, hang | (v >> 2));
        hang = (v << 6) & 0xff;
        break;
      case 3:
        bView.setUint8(j++, hang | v);
        break;
    }
  }
  return b;
}
