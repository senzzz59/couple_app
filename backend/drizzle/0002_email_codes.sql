CREATE TABLE `email_codes` (
	`id` varchar(36) NOT NULL,
	`email` varchar(191) NOT NULL,
	`purpose` enum('register','reset') NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expires_at` datetime(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `email_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `email_codes_email_idx` ON `email_codes` (`email`,`purpose`);