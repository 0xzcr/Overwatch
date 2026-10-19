import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  website: text("website"),
  defillamaSlug: text("defillama_slug"),
  network: text("network").notNull().default("mainnet"),
  source: text("source").notNull().default("config"),
  config: jsonb("config").notNull(),
  verified: boolean("verified").notNull().default(false),
  verification: jsonb("verification"),
  tvlUsd: bigint("tvl_usd", { mode: "number" }),
  tvlFetchedAt: timestamp("tvl_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchedAccounts = pgTable(
  "watched_accounts",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    kind: text("kind").notNull(), // program | programdata | multisig | admin | mint | oracle | nonce
    label: text("label"),
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [uniqueIndex("watched_unique").on(t.protocolId, t.address, t.kind), index("watched_address").on(t.address)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    slot: bigint("slot", { mode: "number" }).notNull(),
    contentHash: text("content_hash").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_protocol").on(t.protocolId, t.createdAt)],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    weakening: boolean("weakening").notNull().default(false),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    labels: jsonb("labels").notNull().default([]),
    before: jsonb("before"),
    after: jsonb("after"),
    slot: bigint("slot", { mode: "number" }),
    blockTime: timestamp("block_time", { withTimezone: true }),
    txSignature: text("tx_signature"),
    source: text("source").notNull(), // live | backfill | reconstructed
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_protocol").on(t.protocolId, t.detectedAt),
    index("events_detected").on(t.detectedAt),
    index("events_severity").on(t.severity),
    uniqueIndex("events_dedupe").on(t.protocolId, t.type, t.txSignature, t.title),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    grade: text("grade").notNull(),
    flags: bigint("flags", { mode: "bigint" }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scores_protocol").on(t.protocolId, t.computedAt)],
);

export const signers = pgTable(
  "signers",
  {
    address: text("address").notNull(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    multisigAddress: text("multisig_address").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address, t.multisigAddress] })],
);

export const nonceAccounts = pgTable(
  "nonce_accounts",
  {
    address: text("address").primaryKey(),
    authority: text("authority").notNull(),
    firstSeenSlot: bigint("first_seen_slot", { mode: "number" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("nonce_authority").on(t.authority)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(), // telegram | webhook | email
    target: text("target").notNull(),
    protocolIds: integer("protocol_ids").array(), // null = all
    minSeverity: text("min_severity").notNull().default("HIGH"),
    secret: text("secret"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("subs_channel_target").on(t.channel, t.target)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | delivered | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("deliveries_dedupe").on(t.subscriptionId, t.eventId),
    index("deliveries_pending").on(t.status, t.nextAttemptAt),
  ],
);

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  owner: text("owner").notNull(),
  tier: text("tier").notNull().default("free"),
  rateLimit: integer("rate_limit").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const onchainPublishes = pgTable("onchain_publishes", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id")
    .notNull()
    .references(() => protocols.id, { onDelete: "cascade" }),
  txSignature: text("tx_signature"),
  score: integer("score").notNull(),
  flags: bigint("flags", { mode: "bigint" }).notNull(),
  slot: bigint("slot", { mode: "number" }),
  status: text("status").notNull(),
  kind: text("kind").notNull().default("registry"), // registry | shield
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
