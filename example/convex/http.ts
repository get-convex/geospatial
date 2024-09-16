import { httpRouter } from "convex/server";
import { executeStreaming } from "./search";
import { httpAction } from "./_generated/server";

const http = httpRouter();
http.route({
  method: "POST",
  path: "/search",
  handler: executeStreaming,
});
http.route({
  method: "OPTIONS",
  path: "/search",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

export default http;
