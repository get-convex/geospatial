import { compareUTF8 } from "compare-utf8";
import { v, Infer } from "convex/values";

export const primitive = v.union(
    v.string(),
    v.number(),
    v.boolean(),
    v.bytes(),
    v.null(),
    v.int64(),
  );
  export type Primitive = Infer<typeof primitive>;

export const MIN_PRIMITIVE: Primitive = null;  

// Matching Convex's order, we order primitive types as follows:
// 1. null
// 2. bigint
// 3. number
// 4. boolean
// 5. string
// 6. ArrayBuffer
function primitiveTypeRank(a: Primitive): number {
    if (a === null) {
        return 1;
    }
    if (typeof a === "bigint") {
        return 2;
    }
    if (typeof a === "number") {
        return 3;
    }
    if (typeof a === "boolean") {
        return 4;
    }
    if (typeof a === "string") {
        return 5;
    }
    if (a instanceof ArrayBuffer) {
        return 6;
    }
    throw new Error("Unknown primitive type");
}

export function primitiveCompare(a: Primitive, b: Primitive): number {
    const aRank = primitiveTypeRank(a);
    const bRank = primitiveTypeRank(b);

    if (aRank < bRank) {
        return -1;
    }
    if (aRank > bRank) {
        return 1;
    }
    // If both values are null, they must be equal.
    if (aRank === 1) {
        return 0;
    }
    // If we're a bigint, number, or boolean, just use regular comparisons.
    if (2 <= aRank && aRank <= 4) {
        const aPrimitive = a as bigint | boolean | string;
        const bPrimitive = b as bigint | boolean | string;
        return aPrimitive < bPrimitive ? -1 : aPrimitive > bPrimitive ? 1 : 0;
    }
    // If we're a string, we need to use UTF-8 aware comparison.
    if (aRank === 5) {
        const aString = a as string;
        const bString = b as string;
        return compareUTF8(aString, bString);

    }
    // If we're an ArrayBuffer, we need to compare the underlying Uint8Arrays.
    if (aRank === 6) {
        const aArray = a as Uint8Array;
        const bArray = b as Uint8Array;
        const length = Math.min(aArray.length, bArray.length);
        for (let i = 0; i < length; i++) {
            const aByte = aArray[i];
            const bByte = bArray[i];
            if (aByte !== bByte) {
                return aByte - bByte;
            }
        }
        return aArray.length - bArray.length;
    }
    throw new Error("Unknown primitive type");
}