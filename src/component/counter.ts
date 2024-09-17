import { MutationCtx, QueryCtx } from "./_generated/server.js";

const NUM_SHARDS = 4;

export async function get(ctx: QueryCtx, key: string): Promise<number> {
  let result = 0;
  const counters = ctx.db
    .query("counters")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key));
  for await (const counter of counters) {
    result += counter.value;
  }
  return result;
}

export async function increment(
  ctx: MutationCtx,
  key: string,
  delta: number,
): Promise<void> {
  const shard = Math.floor(Math.random() * NUM_SHARDS);
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key).eq("shard", shard))
    .first();
  if (counter !== null) {
    await ctx.db.patch(counter._id, { value: counter.value + delta });
  } else {
    await ctx.db.insert("counters", { key, shard, value: delta });
  }
}
