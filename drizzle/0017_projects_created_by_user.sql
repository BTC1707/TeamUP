ALTER TABLE `users` ADD `projects_created` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `projects_created` = (
	SELECT count(*) FROM `projects`
	WHERE `projects`.`owner` = `users`.`id` OR `projects`.`owner` = coalesce(`users`.`auth_id`, '')
);
