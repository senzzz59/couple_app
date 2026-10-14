CREATE TABLE `capsules` (
	`id` varchar(36) NOT NULL,
	`title` varchar(40) NOT NULL,
	`content` text NOT NULL,
	`photos` json NOT NULL DEFAULT ('[]'),
	`unlock_at` date NOT NULL,
	`opened_by` json NOT NULL DEFAULT ('[]'),
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capsules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capsules_unlock_idx` ON `capsules` (`unlock_at`);