CREATE TABLE `couples` (
	`id` varchar(36) NOT NULL,
	`invite_code` varchar(12),
	`start_date` date,
	`title` varchar(40),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `couples_id` PRIMARY KEY(`id`),
	CONSTRAINT `couples_invite_code_unique` UNIQUE(`invite_code`)
);--> statement-breakpoint
-- 已有的两个人和他们的数据成为第一对情侣（新安装的空数据库不创建）
INSERT INTO `couples` (`id`, `start_date`, `title`) SELECT '00000000-0000-4000-8000-000000000001', (SELECT `start_date` FROM `space` WHERE `id` = 1), (SELECT `title` FROM `space` WHERE `id` = 1) FROM DUAL WHERE EXISTS (SELECT 1 FROM `users`);--> statement-breakpoint
ALTER TABLE `users` ADD `couple_id` varchar(36);--> statement-breakpoint
UPDATE `users` SET `couple_id` = '00000000-0000-4000-8000-000000000001' WHERE EXISTS (SELECT 1 FROM `couples` WHERE `id` = '00000000-0000-4000-8000-000000000001');--> statement-breakpoint
ALTER TABLE `albums` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `albums` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `anniversaries` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `anniversaries` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `answers` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `answers` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `capsules` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `capsules` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `comments` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `comments` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `gallery_items` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `gallery_items` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `messages` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `messages` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `moments` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `moments` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `places` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `places` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `questions` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `questions` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `shared_settings` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `shared_settings` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `stickers` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `stickers` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `todos` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `todos` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `visits` ADD `couple_id` varchar(36) NOT NULL;--> statement-breakpoint
UPDATE `visits` SET `couple_id` = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE `answers` DROP INDEX `answers_day_user`;--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_couple_day_user` UNIQUE(`couple_id`,`day`,`created_by`);--> statement-breakpoint
ALTER TABLE `shared_settings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `shared_settings` ADD PRIMARY KEY(`couple_id`,`key`);--> statement-breakpoint
DROP INDEX `capsules_unlock_idx` ON `capsules`;--> statement-breakpoint
DROP INDEX `gallery_taken_idx` ON `gallery_items`;--> statement-breakpoint
DROP INDEX `messages_created_idx` ON `messages`;--> statement-breakpoint
DROP INDEX `questions_created_idx` ON `questions`;--> statement-breakpoint
CREATE INDEX `capsules_couple_unlock_idx` ON `capsules` (`couple_id`,`unlock_at`);--> statement-breakpoint
CREATE INDEX `gallery_couple_taken_idx` ON `gallery_items` (`couple_id`,`taken_at`);--> statement-breakpoint
CREATE INDEX `messages_couple_created_idx` ON `messages` (`couple_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `questions_couple_created_idx` ON `questions` (`couple_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `albums` ADD CONSTRAINT `albums_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anniversaries` ADD CONSTRAINT `anniversaries_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capsules` ADD CONSTRAINT `capsules_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gallery_items` ADD CONSTRAINT `gallery_items_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moments` ADD CONSTRAINT `moments_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `places` ADD CONSTRAINT `places_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shared_settings` ADD CONSTRAINT `shared_settings_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stickers` ADD CONSTRAINT `stickers_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `visits` ADD CONSTRAINT `visits_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_couple_id_couples_id_fk` FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON DELETE set null ON UPDATE no action;