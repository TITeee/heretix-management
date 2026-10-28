-- A session carries the user's sessionVersion from sign-in, and is signed out once
-- it no longer matches (see lib/auth.ts); a password change raises it. Existing
-- sessions carry none and are signed out once, on their next request.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- A user created without a role is an operator. Existing users keep theirs.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'operator';
