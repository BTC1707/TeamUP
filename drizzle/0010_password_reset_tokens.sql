CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_token_hash` ON `password_reset_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `password_reset_user` ON `password_reset_tokens` (`user_id`);
