// Convex Auth configuration. The `domain` value must match the SITE_URL
// environment variable Convex Auth sets up automatically — it's the URL
// users get redirected to after OAuth (e.g. ardent-mockingbird-866.convex.site
// in dev, your custom domain in production).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
