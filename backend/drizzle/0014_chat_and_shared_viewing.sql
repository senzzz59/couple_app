CREATE TABLE `chat_reads` (
	`user_id` varchar(36) NOT NULL,
	`read_at` datetime(3) NOT NULL,
	CONSTRAINT `chat_reads_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL,
	`kind` enum('text','image','sticker','voice','photo') NOT NULL DEFAULT 'text',
	`content` varchar(1000),
	`image` varchar(100),
	`sticker` varchar(100),
	`voice` varchar(100),
	`duration` double,
	`gallery_id` varchar(36),
	`reply_to_id` varchar(36),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `share_viewing` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_gallery_id_gallery_items_id_fk` FOREIGN KEY (`gallery_id`) REFERENCES `gallery_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_created_idx` ON `messages` (`created_at`);