declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BETTER_AUTH_SECRET?:string;
    BETTER_AUTH_URL?:string;
    BOOTSTRAP_OWNER_EMAIL?:string;
    BUCKET?: R2Bucket;
  }
}
