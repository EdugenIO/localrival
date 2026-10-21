import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const steamLinks = sqliteTable("steam_links", {
  userId: text("user_id").primaryKey(),
  steamId: text("steam_id").notNull().unique(),
  linkedAt: integer("linked_at").notNull(),
  dotaData: text("dota_data"),
  csData: text("cs_data"),
  syncedAt: integer("synced_at"),
  refreshAfter: integer("refresh_after").notNull().default(0),
});
export const steamAttempts = sqliteTable("steam_attempts", {
  stateHash: text("state_hash").primaryKey(),
  userId: text("user_id").notNull().unique(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
