DROP TABLE IF EXISTS "demo_actions" CASCADE;--> statement-breakpoint
DELETE FROM "events" WHERE "source" = 'demo';--> statement-breakpoint
DELETE FROM "protocols" WHERE "source" = 'demo';
