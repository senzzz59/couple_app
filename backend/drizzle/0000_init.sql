CREATE TABLE `anniversaries` (
	`id` varchar(36) NOT NULL,
	`title` varchar(40) NOT NULL,
	`date` date NOT NULL,
	`kind` enum('love','birthday','custom') NOT NULL DEFAULT 'custom',
	`lunar` boolean NOT NULL DEFAULT false,
	`yearly` boolean NOT NULL DEFAULT true,
	`remind` json NOT NULL DEFAULT ('[0]'),
	`emoji` varchar(16),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anniversaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` varchar(36) NOT NULL,
	`day` varchar(10) NOT NULL,
	`question` int NOT NULL,
	`content` text NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `answers_day_user` UNIQUE(`day`,`created_by`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` varchar(36) NOT NULL,
	`moment_id` varchar(36) NOT NULL,
	`content` varchar(500) NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `moment_likes` (
	`moment_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `moment_likes_moment_id_user_id_pk` PRIMARY KEY(`moment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `moments` (
	`id` varchar(36) NOT NULL,
	`content` text,
	`photos` json NOT NULL DEFAULT ('[]'),
	`mood` varchar(16),
	`place_id` varchar(36),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `moments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nudges` (
	`id` varchar(36) NOT NULL,
	`from_id` varchar(36) NOT NULL,
	`to_id` varchar(36) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `nudges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`address` varchar(200),
	`city` varchar(40),
	`lat` double,
	`lng` double,
	`category` varchar(20),
	`status` enum('want','visited') NOT NULL DEFAULT 'want',
	`rating` double,
	`price` int,
	`xhs_url` varchar(500),
	`note` text,
	`cover` varchar(100),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `places_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `space` (
	`id` int NOT NULL,
	`start_date` date,
	`title` varchar(40),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `space_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` varchar(36) NOT NULL,
	`title` varchar(120) NOT NULL,
	`note` text,
	`done` boolean NOT NULL DEFAULT false,
	`done_at` datetime(3),
	`due` datetime(3),
	`assignee_id` varchar(36),
	`category` varchar(20),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`name` varchar(40) NOT NULL DEFAULT '',
	`avatar` varchar(100),
	`birthday` date,
	`birthday_lunar` boolean NOT NULL DEFAULT false,
	`mood` varchar(16),
	`mood_text` varchar(60),
	`mood_at` datetime(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` varchar(36) NOT NULL,
	`place_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`photos` json NOT NULL DEFAULT ('[]'),
	`dishes` json NOT NULL DEFAULT ('[]'),
	`rating` double,
	`note` text,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_moment_id_moments_id_fk` FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moment_likes` ADD CONSTRAINT `moment_likes_moment_id_moments_id_fk` FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moments` ADD CONSTRAINT `moments_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `visits` ADD CONSTRAINT `visits_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `comments_moment_idx` ON `comments` (`moment_id`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`status`);--> statement-breakpoint
CREATE INDEX `visits_place_idx` ON `visits` (`place_id`);