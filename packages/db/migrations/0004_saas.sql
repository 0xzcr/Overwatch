CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"watchlist" integer[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_wallet_unique" UNIQUE("wallet")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"plan" text NOT NULL,
	"months" integer NOT NULL,
	"amount" bigint NOT NULL,
	"network" text NOT NULL,
	"mint" text NOT NULL,
	"treasury" text NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"tx_signature" text,
	"payer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoices_reference_unique" UNIQUE("reference"),
	CONSTRAINT "invoices_tx_signature_unique" UNIQUE("tx_signature")
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"code" text PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "protocols" ADD COLUMN "owner_account_id" integer;--> statement-breakpoint
ALTER TABLE "protocols" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "ruleset" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_account" ON "invoices" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_open_amount" ON "invoices" USING btree ("amount") WHERE status = 'open';--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;