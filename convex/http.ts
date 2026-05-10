import { httpRouter } from "convex/server";
import { auth } from "./auth";

// HTTP router for Convex. Convex Auth needs HTTP endpoints for OAuth
// redirects (Google → Convex → back to our app) and for password sign-in /
// sign-up flows.
const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
