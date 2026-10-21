CREATE TABLE "mailchimp_contacts" (
	"campaign_id" text NOT NULL,
	"wave" integer NOT NULL,
	"email" text NOT NULL,
	"account_id" text NOT NULL,
	"company" text NOT NULL,
	"result" text NOT NULL,
	"error" text,
	"fields_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailchimp_contacts_campaign_id_wave_email_pk" PRIMARY KEY("campaign_id","wave","email")
);
--> statement-breakpoint
CREATE TABLE "mailchimp_runs" (
	"campaign_id" text NOT NULL,
	"wave" integer NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"step" text,
	"error" text,
	"segment_id" integer,
	"mc_campaign_id" text,
	"field_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" integer,
	"test_sent_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailchimp_runs_campaign_id_wave_pk" PRIMARY KEY("campaign_id","wave")
);
--> statement-breakpoint
ALTER TABLE "mailchimp_contacts" ADD CONSTRAINT "mailchimp_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailchimp_runs" ADD CONSTRAINT "mailchimp_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;