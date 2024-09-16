import { GeospatialIndex, Point } from "../../src/client";
import { Id } from "./_generated/dataModel";
import { components } from "./_generated/server";

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
