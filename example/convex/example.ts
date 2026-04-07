import { GeospatialIndex, point, polygon, polyline, rectangle } from "@convex-dev/geospatial";
import { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const geospatial = new GeospatialIndex<
  Id<"locations">,
  { name: string }
>(components.geospatial);

export const addPoint = mutation({
  args: { point, name: v.string() },
  handler: async (ctx, { point, name }) => {
    const id = await ctx.db.insert("locations", {
      name,
    });
    await geospatial.insert(ctx, id, point, { name });
  },
});

export const nearestPoints = query({
  args: {
    point,
    maxRows: v.number(),
    maxDistance: v.optional(v.number()),
  },
  handler: async (ctx, { point, maxRows, maxDistance }) => {
    const results = await geospatial.nearest(ctx, {
      point,
      limit: maxRows,
      maxDistance,
    });
    return await Promise.all(
      results.map(async (result) => {
        const row = await ctx.db.get(result.key as Id<"locations">);
        if (!row) {
          throw new Error("Invalid locationId");
        }
        return {
          ...result,
          coordinates: {
            ...result.coordinates,
            name: row.name,
          },
        };
      }),
    );
  },
});

export const search = query({
  args: {
    rectangle,
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    cursor: v.optional(v.string()),
    maxRows: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("locations"),
        _creationTime: v.number(),
        name: v.string(),
        coordinates: point,
      }),
    ),
    nextCursor: v.optional(v.string()),
  }),
  async handler(ctx, args) {
    const { results, nextCursor } = await geospatial.query(
      ctx,
      {
        shape: {
          type: "rectangle",
          rectangle: args.rectangle,
        },
        filter: (q) => {
          for (const condition of args.mustFilter) {
            q = q.eq("name", condition);
          }
          if (!args.shouldFilter.length) {
            return q;
          }
          return q.in("name", args.shouldFilter);
        },
        limit: args.maxRows,
      },
      args.cursor,
    );
    const rows = await Promise.all(
      results.map(async (result) => {
        const row = await ctx.db.get(result.key);
        if (!row) {
          throw new Error("Invalid locationId");
        }
        return { ...row, coordinates: result.coordinates };
      }),
    );
    return {
      rows,
      nextCursor,
    };
  },
});

export const searchPolygon = query({
  args: {
    polygon,
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    cursor: v.optional(v.string()),
    maxRows: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("locations"),
        _creationTime: v.number(),
        name: v.string(),
        coordinates: point,
      }),
    ),
    nextCursor: v.optional(v.string()),
  }),
  async handler(ctx, args) {
    if (!args.polygon.exterior || args.polygon.exterior.length < 3) {
      throw new Error("Polygon must have at least 3 exterior points");
    }
    const { results, nextCursor } = await geospatial.query(
      ctx,
      {
        shape: {
          type: "polygon",
          polygon: args.polygon,
        },
        filter: (q) => {
          for (const condition of args.mustFilter) {
            q = q.eq("name", condition);
          }
          if (!args.shouldFilter.length) {
            return q;
          }
          return q.in("name", args.shouldFilter);
        },
        limit: args.maxRows,
      },
      args.cursor,
    );
    const rows = await Promise.all(
      results.map(async (result) => {
        const row = await ctx.db.get(result.key);
        if (!row) {
          throw new Error("Invalid locationId");
        }
        return { ...row, coordinates: result.coordinates };
      }),
    );
    return {
      rows,
      nextCursor,
    };
  },
});

export const searchPolyline = query({
  args: {
    polyline,
    bufferMeters: v.number(),
    mustFilter: v.array(v.string()),
    shouldFilter: v.array(v.string()),
    cursor: v.optional(v.string()),
    maxRows: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("locations"),
        _creationTime: v.number(),
        name: v.string(),
        coordinates: point,
      }),
    ),
    nextCursor: v.optional(v.string()),
  }),
  async handler(ctx, args) {
    if (args.polyline.length < 2) {
      throw new Error("Polyline must have at least 2 points");
    }
    if (!Number.isFinite(args.bufferMeters) || args.bufferMeters < 0) {
      throw new Error("bufferMeters must be a finite non-negative number");
    }
    const { results, nextCursor } = await geospatial.query(
      ctx,
      {
        shape: {
          type: "polyline",
          polyline: args.polyline,
          bufferMeters: args.bufferMeters,
        },
        filter: (q) => {
          for (const condition of args.mustFilter) {
            q = q.eq("name", condition);
          }
          if (!args.shouldFilter.length) {
            return q;
          }
          return q.in("name", args.shouldFilter);
        },
        limit: args.maxRows,
      },
      args.cursor,
    );
    const rows = await Promise.all(
      results.map(async (result) => {
        const row = await ctx.db.get(result.key);
        if (!row) {
          throw new Error("Invalid locationId");
        }
        return { ...row, coordinates: result.coordinates };
      }),
    );
    return {
      rows,
      nextCursor,
    };
  },
});

export const debugCells = query({
  args: {
    rectangle,
    maxResolution: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await geospatial.debugCells(ctx, args.rectangle, args.maxResolution);
  },
});

export const listGeometries = query({
  args: {},
  handler: async (ctx) => {
    return await geospatial.listGeometries(ctx);
  },
});

export const geometryContainsPoint = query({
  args: {
    point,
  },
  handler: async (ctx, args) => {
    return await geospatial.containsPoint(ctx, args.point);
  },
});

export const geometryIntersects = query({
  args: {
    rectangle,
  },
  handler: async (ctx, args) => {
    return await geospatial.intersects(ctx, {
      type: "rectangle",
      rectangle: args.rectangle,
    });
  },
});

export const geometriesNearPoint = query({
  args: {
    point,
    maxDistance: v.number(),
  },
  handler: async (ctx, args) => {
    return await geospatial.geometriesNear(ctx, args.point, args.maxDistance);
  },
});

export const deleteGeometry = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await geospatial.removeGeometry(ctx, args.key);
  },
});

export const measurePolygon = query({
  args: {
    polygon,
  },
  handler: async (ctx, args) => {
    const [area, perimeter, centroid] = await Promise.all([
      geospatial.polygonArea(ctx, args.polygon),
      geospatial.polygonPerimeter(ctx, args.polygon),
      geospatial.polygonCentroid(ctx, args.polygon),
    ]);
    return { area, perimeter, centroid };
  },
});

export const measurePolyline = query({
  args: {
    polyline,
  },
  handler: async (ctx, args) => {
    const [length, centroid] = await Promise.all([
      geospatial.polylineLength(ctx, args.polyline),
      geospatial.polylineCentroid(ctx, args.polyline),
    ]);
    return { length, centroid };
  },
});
