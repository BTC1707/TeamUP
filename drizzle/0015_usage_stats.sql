ALTER TABLE `projects` ADD `tasks_created` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `milestones_created` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `account_activity` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`actions` integer DEFAULT 0 NOT NULL,
	`last_seen` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_activity_day` ON `account_activity` (`day`);
--> statement-breakpoint
UPDATE `projects` SET `tasks_created` = (
	SELECT count(*) FROM `tasks` WHERE `tasks`.`project_id` = `projects`.`id`
);
--> statement-breakpoint
UPDATE `projects` SET `milestones_created` = (
	SELECT count(*) FROM `milestones` WHERE `milestones`.`project_id` = `projects`.`id`
);
--> statement-breakpoint
CREATE TABLE `site_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`projects_created` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `site_stats` (`id`, `projects_created`)
SELECT 'site', count(*) FROM `projects`;
