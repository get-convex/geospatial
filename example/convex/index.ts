import { GeospatialIndex } from "../../src/client";
import { Id } from "./_generated/dataModel";
import { components } from "./_generated/server";;

export const geospatial = new GeospatialIndex<Id<"locations">>(components.geospatial);



