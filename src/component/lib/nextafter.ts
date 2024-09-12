// https://github.com/scijs/nextafter/tree/master

// The MIT License (MIT)

// Copyright (c) 2013 Mikola Lysenko

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

const SMALLEST_DENORM = Math.pow(2, -1074)
const UINT_MAX = (-1)>>>0

export function nextafter(x: number, y: number) {
    if(isNaN(x) || isNaN(y)) {
      return NaN
    }
    if(x === y) {
      return x
    }
    if(x === 0) {
      if(y < 0) {
        return -SMALLEST_DENORM
      } else {
        return SMALLEST_DENORM
      }
    }

    const float64Array = new Float64Array([x]);
    const uint32Array = new Uint32Array(float64Array.buffer);
    let hi = uint32Array[1];
    let lo = uint32Array[0];    
    if((y > x) === (x > 0)) {
      if(lo === UINT_MAX) {
        hi += 1
        lo = 0
      } else {
        lo += 1
      }
    } else {
      if(lo === 0) {
        lo = UINT_MAX
        hi -= 1
      } else {
        lo -= 1
      }
    } 
    uint32Array[0] = lo;
    uint32Array[1] = hi;
    return float64Array[0];
  }