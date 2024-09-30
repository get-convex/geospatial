import { GeospatialIndex, Point } from "@convex-dev/geospatial";
import { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";

type EmojiLocation = {
  key: Id<"locations">;
  coordinates: Point;
  filterKeys: {
    name: string;
  };
  sortKey: number;
};

export const geospatial = new GeospatialIndex<EmojiLocation>(
  components.geospatial,
);
