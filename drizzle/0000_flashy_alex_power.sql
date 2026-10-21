CREATE TABLE `steam_attempts` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steam_attempts_user_id_unique` ON `steam_attempts` (`user_id`);--> statement-breakpoint
CREATE TABLE `steam_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`steam_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	`dota_data` text,
	`cs_data` text,
	`synced_at` integer,
	`refresh_after` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steam_links_steam_id_unique` ON `steam_links` (`steam_id`);