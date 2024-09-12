import { Heap }  from "heap-js";
import { Id } from "../_generated/dataModel.js";
import { Primitive, primitiveCompare } from "./primitive.js";
import { QueryCtx } from "../_generated/server.js";
import { Interval } from "./interval.js";
import { encodeBound, TupleKey } from "./tupleKey.js";

export interface PointSet {
    /**
     * Advance the stream to the next item and return it. Return null if the stream is exhausted.
     */
    advance(): Promise<TupleKey | null>;

    /**
     * Return the current item in the stream.
     */
    current(): Promise<TupleKey | null>;

    /**
     * Seek to the given tuple.
     */
    seek(tuple: TupleKey): Promise<void>;
}

type HeapEntry = {
    tuple: TupleKey;
    stream: PointSet;
}

export class Union implements PointSet {        
    private heap?: Heap<HeapEntry>;

    constructor(private streams: Array<PointSet>) {
    }

    async initializeHeap(): Promise<Heap<HeapEntry>> {
        if (this.heap) {
            return this.heap;
        }
        const promises = this.streams.map(stream => stream.current());
        const results = await Promise.all(promises);

        const entries = []        
        for (let i = 0; i < this.streams.length; i++) {
            const result = results[i];
            if (result !== null) {
                entries.push({tuple: result, stream: this.streams[i]});
            }
        }
        const heap = new Heap<HeapEntry>((a, b) => a.tuple < b.tuple ? -1 : a.tuple > b.tuple ? 1 : 0);
        heap.init(entries);
        this.heap = heap;
        return heap;
    }

    async current(): Promise<TupleKey | null> {
        const heap = await this.initializeHeap();        
        const smallest = heap.peek();
        if (smallest === undefined) {
            return null;
        }
        return smallest.tuple;
    }

    async advance(): Promise<TupleKey | null> {
        const heap = await this.initializeHeap();
        const smallest = heap.pop();
        if (smallest === undefined) {
            return null;
        }
        const toRefill = [smallest.stream];
        while (true) {
            const next = heap.peek();
            if (next === undefined) {
                break;
            }
            if (smallest.tuple === next.tuple) {
                heap.pop();
                toRefill.push(next.stream);
                continue;
            } 
            break;
        }
        for (const stream of toRefill) {
            const result = await stream.advance();
            if (result !== null) {
                heap.push({ tuple: result, stream });
            }
        }
        return smallest.tuple;
    }

    async seek(pos: TupleKey): Promise<void> {
        const heap = await this.initializeHeap();
        
        // Remove the heap entries that are less than `pos`.
        const toRefill = [];
        while (true) {
            const next = heap.peek();
            if (next === undefined) {
                break;
            }
            if (next.tuple < pos) {
                heap.pop();
                toRefill.push(next.stream);
                continue;
            } 
            break;        
        }
        
        const seekPromises = toRefill.map(stream => stream.seek(pos));
        await Promise.all(seekPromises);

        const currentPromises = toRefill.map(async (stream) => {
            const result = await stream.current();
            return { result, stream };
        });
        const currentResults = await Promise.all(currentPromises);
        for (const { result, stream } of currentResults) {
            if (result !== null) {
                heap.push({ tuple: result, stream });
            }
        }
    }
}

export class Intersection implements PointSet {
    private state: {type: "init"} | {type: "aligned", tuple: TupleKey} | {type: "done"} = {type: "init"};
    constructor(private streams: Array<PointSet>) {
    }

    async tryAlign(): Promise<TupleKey | null> {
        while (true) {
            const results = await Promise.all(this.streams.map(async (stream) => { return { result: await stream.current(), stream }}));
            let candidate: { result: TupleKey, streams: PointSet[] } | null = null;
            const needAdvance = [];
            for (const { result, stream } of results) {
                if (result === null) {
                    continue;                
                }
                if (candidate === null) {
                    candidate = { result, streams: [stream] };
                    continue;
                }
                if (candidate.result < result) {
                    needAdvance.push(...candidate.streams);
                    candidate = { result, streams: [stream] };                    
                } else if (candidate.result === result) {
                    candidate.streams.push(stream);
                } else {
                    needAdvance.push(stream);
                }                
            }
            if (candidate === null) {
                this.state = {type: "done"};
                return null;
            }
            if (needAdvance.length === 0) {
                this.state = {type: "aligned", tuple: candidate.result};
                return candidate.result;
            }
            const seekPromises = needAdvance.map(stream => stream.seek(candidate.result));
            await Promise.all(seekPromises);
        }
    }

    async current(): Promise<TupleKey | null> {
        if (this.state.type === "done") {
            return null;
        }
        if (this.state.type === "aligned") {
            return this.state.tuple;
        }
        return this.tryAlign();
    }

    async advance(): Promise<TupleKey | null> {
        if (this.state.type === "done") {
            return null;
        }
        if (this.streams.length === 0) {
            this.state = {type: "done"};
            return null;
        }
        const result = await this.streams[0].advance();
        if (result === null) {
            this.state = {type: "done"};
            return null;
        }
        return await this.tryAlign();        
    }

    async seek(tuple: TupleKey): Promise<void> {
        const seekPromises = this.streams.map(stream => stream.seek(tuple));
        await Promise.all(seekPromises);
    }
}

const BATCH_SIZE = 8;

export class H3CellRange implements PointSet {
    private state: { type: "init" } | { type: "buffered", buffer: TupleKey[], pos: number } | { type: "done" } = { type: "init" };

    constructor(
        private ctx: QueryCtx,
        private h3Cell: string,
        private interval: Interval,
    ) {        
    }

    async current(): Promise<TupleKey | null> {
        if (this.state.type === "done") {
            return null;
        }
        if (this.state.type === "buffered") {
            return this.state.buffer[this.state.pos];
        }

        const docs = await this.ctx.db.query("pointsbyH3Cell")
            .withIndex("h3Cell", (q) => {
                const withH3Cell = q.eq("h3Cell", this.h3Cell);
                let withStart;            
                if (this.interval.startInclusive !== undefined) {
                    const bound = encodeBound(this.interval.startInclusive);
                    withStart = withH3Cell.gte("tupleKey", bound);
                } else {
                    withStart = withH3Cell;
                }
                let withEnd;
                if (this.interval.endExclusive !== undefined) {
                    const bound = encodeBound(this.interval.endExclusive);
                    withEnd = withStart.lt("tupleKey", bound);
                } else {
                    withEnd = withStart;
                }
                return withEnd;
            })
            .take(BATCH_SIZE);  
        console.log(`Loaded ${docs.length} rows for ${this.h3Cell}`);          

        if (docs.length === 0) {
            this.state = { type: "done" };
            return null;
        }
        const buffer = docs.map(doc => doc.tupleKey);
        this.state = { type: "buffered", buffer, pos: 0 };
        return this.state.buffer[0];
    }

    async advance(): Promise<TupleKey | null> {
        if (this.state.type === "done") {
            return null;
        }
        if (this.state.type === "init") {
            await this.current();
            return await this.advance();
        }
        if (this.state.pos < this.state.buffer.length - 1) {            
            this.state.pos++;
            return this.state.buffer[this.state.pos];
        }
        const lastKey = this.state.buffer[this.state.buffer.length - 1];
        const docs = await this.ctx.db.query("pointsbyH3Cell")
            .withIndex("h3Cell", (q) => {
                const withStart = q.eq("h3Cell", this.h3Cell).gt("tupleKey", lastKey);
                let withEnd;
                if (this.interval.endExclusive !== undefined) {
                    const bound = encodeBound(this.interval.endExclusive);
                    withEnd = withStart.lt("tupleKey", bound);
                } else {
                    withEnd = withStart;
                }
                return withEnd;
            })
            .take(BATCH_SIZE);
        console.log(`Loaded ${docs.length} rows for ${this.h3Cell}`);          

        if (docs.length === 0) {
            this.state = { type: "done" };
            return null;
        }
        const buffer = docs.map(doc => doc.tupleKey);
        this.state = { type: "buffered", buffer, pos: 0 };
        return this.state.buffer[0];
    }

    async seek(tuple: TupleKey): Promise<void> {
        if (this.state.type === "init") {
            await this.current();            
            return await this.seek(tuple);
        }
        if (this.state.type === "done") {
            return;
        }
        if (tuple < this.state.buffer[0]) {
            return;
        }
        if (tuple <= this.state.buffer[this.state.buffer.length - 1]) {
            const newPos = this.state.buffer.findIndex(key => key >= tuple);
            this.state.pos = Math.max(newPos, this.state.pos);
            return;
        }
        const docs = await this.ctx.db.query("pointsbyH3Cell")
            .withIndex("h3Cell", (q) => {
                const withStart = q.eq("h3Cell", this.h3Cell).gte("tupleKey", tuple);
                let withEnd;
                if (this.interval.endExclusive !== undefined) {
                    const bound = encodeBound(this.interval.endExclusive);
                    withEnd = withStart.lt("tupleKey", bound);
                } else {
                    withEnd = withStart;
                }
                return withEnd;
            })
            .take(BATCH_SIZE);
        console.log(`Loaded ${docs.length} rows for ${this.h3Cell}`);          

        if (docs.length === 0) {
            this.state = { type: "done" };
            return;
        }
        const buffer = docs.map(doc => doc.tupleKey);
        this.state = { type: "buffered", buffer, pos: 0 };
    }
}

export class FilterKeyRange implements PointSet {
    constructor(
        private ctx: QueryCtx,
        private filterKey: string,
        private filterValue: Primitive,
        private interval: Interval,
    ) {}

    async current(): Promise<TupleKey | null> {
        throw new Error("Not implemented");
    }

    async advance(): Promise<TupleKey | null> {
        throw new Error("Not implemented");
    }

    async seek(tuple: TupleKey): Promise<void> {
        throw new Error("Not implemented");
    }
}