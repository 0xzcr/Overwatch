CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"owner" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"rate_limit" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "demo_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"tx_signatures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"log" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"weakening" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"slot" bigint,
	"block_time" timestamp with time zone,
	"tx_signature" text,
	"source" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonce_accounts" (
	"address" text PRIMARY KEY NOT NULL,
	"authority" text NOT NULL,
	"first_seen_slot" bigint,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onchain_publishes" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"tx_signature" text,
	"score" integer NOT NULL,
	"flags" bigint NOT NULL,
	"slot" bigint,
	"status" text NOT NULL,
	"kind" text DEFAULT 'registry' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"website" text,
	"defillama_slug" text,
	"network" text DEFAULT 'mainnet' NOT NULL,
	"source" text DEFAULT 'config' NOT NULL,
	"config" jsonb NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification" jsonb,
	"tvl_usd" bigint,
	"tvl_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocols_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"score" integer NOT NULL,
	"grade" text NOT NULL,
	"flags" bigint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signers" (
	"address" text NOT NULL,
	"protocol_id" integer NOT NULL,
	"multisig_address" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signers_address_multisig_address_pk" PRIMARY KEY("address","multisig_address")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"slot" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"protocol_ids" integer[],
	"min_severity" text DEFAULT 'HIGH' NOT NULL,
	"secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"address" text NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onchain_publishes" ADD CONSTRAINT "onchain_publishes_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signers" ADD CONSTRAINT "signers_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_accounts" ADD CONSTRAINT "watched_accounts_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_dedupe" ON "deliveries" USING btree ("subscription_id","event_id");--> statement-breakpoint
CREATE INDEX "deliveries_pending" ON "deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "events_protocol" ON "events" USING btree ("protocol_id","detected_at");--> statement-breakpoint
CREATE INDEX "events_detected" ON "events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "events_severity" ON "events" USING btree ("severity");--> statement-breakpoint
CREATE UNIQUE INDEX "events_dedupe" ON "events" USING btree ("protocol_id","type","tx_signature","title");--> statement-breakpoint
CREATE INDEX "nonce_authority" ON "nonce_accounts" USING btree ("authority");--> statement-breakpoint
CREATE INDEX "scores_protocol" ON "scores" USING btree ("protocol_id","computed_at");--> statement-breakpoint
CREATE INDEX "snapshots_protocol" ON "snapshots" USING btree ("protocol_id","created_at");--> statement-breakpoint
CREATE INDEX "subs_channel_target" ON "subscriptions" USING btree ("channel","target");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_unique" ON "watched_accounts" USING btree ("protocol_id","address","kind");--> statement-breakpoint
CREATE INDEX "watched_address" ON "watched_accounts" USING btree ("address");