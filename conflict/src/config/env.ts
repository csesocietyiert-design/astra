import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);
const tableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const bucketName = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,
  ASTRA_SESSION_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  ASTRA_ADMIN_ACCOUNT_IDS: z.string().default(""),
  JUDGE0_API_URL: optionalUrl,
  JUDGE0_API_KEY: optionalSecret,
  JUDGE0_AUTH_HEADER: optionalSecret,
  MEMBER_USER_TABLE: tableName.default("users"),
  MEMBER_PROFILE_TABLE: tableName.default("membership"),
  MEMBER_LOGIN_ID_COLUMN: tableName.default("cse_id"),
  MEMBER_LOGIN_EMAIL_COLUMN: tableName.default("email"),
  MEMBER_PASSWORD_HASH_COLUMN: tableName.default("password_hash"),
  MEMBER_USER_PK_COLUMN: tableName.default("id"),
  MEMBER_PROFILE_ID_COLUMN: tableName.default("society_id"),
  MEMBER_PROFILE_EMAIL_COLUMN: tableName.default("email_address"),
  PROFILE_PHOTO_BUCKET: bucketName.default("astra-profile-photos"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid backend environment: ${result.error.message}`);
}

export const env = result.data;
