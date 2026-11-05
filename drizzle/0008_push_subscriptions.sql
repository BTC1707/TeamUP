CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth_secret` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_user_endpoint` ON `push_subscriptions` (`user_id`,`endpoint`);
