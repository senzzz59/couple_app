CREATE TABLE `album_items` (
	`album_id` varchar(36) NOT NULL,
	`item_id` varchar(36) NOT NULL,
	`added_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `album_items_album_id_item_id_pk` PRIMARY KEY(`album_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` varchar(36) NOT NULL,
	`title` varchar(40) NOT NULL,
	`emoji` varchar(16),
	`description` varchar(200),
	`cover_id` varchar(36),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `albums_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gallery_items` (
	`id` varchar(36) NOT NULL,
	`kind` enum('image','video','live') NOT NULL DEFAULT 'image',
	`image` varchar(100),
	`video` varchar(100),
	`original` varchar(120),
	`file_name` varchar(200),
	`width` int,
	`height` int,
	`duration` double,
	`size` bigint,
	`taken_at` datetime(3) NOT NULL,
	`favorite` boolean NOT NULL DEFAULT false,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gallery_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stickers` (
	`id` varchar(36) NOT NULL,
	`file` varchar(100) NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stickers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comments` ADD `reply_to_id` varchar(36);--> statement-breakpoint
ALTER TABLE `comments` ADD `image` varchar(100);--> statement-breakpoint
ALTER TABLE `comments` ADD `sticker` varchar(100);--> statement-breakpoint
ALTER TABLE `moments` ADD `media` json;--> statement-breakpoint
ALTER TABLE `album_items` ADD CONSTRAINT `album_items_album_id_albums_id_fk` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `album_items` ADD CONSTRAINT `album_items_item_id_gallery_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `gallery_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `album_items_item_idx` ON `album_items` (`item_id`);--> statement-breakpoint
CREATE INDEX `gallery_taken_idx` ON `gallery_items` (`taken_at`);