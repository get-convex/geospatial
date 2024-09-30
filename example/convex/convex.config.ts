import { defineApp } from "convex/server";
import geospatial from "@convex-dev/geospatial/convex.config.js";

const app = defineApp();
app.use(geospatial);

export default app;
