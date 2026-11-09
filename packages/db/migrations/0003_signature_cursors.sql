CREATE TABLE "signature_cursors" (
	"network" text NOT NULL,
	"address" text NOT NULL,
	"signature" text,
	"slot" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_cursors_network_address_pk" PRIMARY KEY("network","address")
);
