ALTER TABLE "users" ADD COLUMN "microsoft_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_microsoft_sub_idx" ON "users" USING btree ("microsoft_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_idx" ON "users" USING btree ("google_sub");