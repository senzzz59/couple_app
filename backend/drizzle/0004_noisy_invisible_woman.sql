CREATE TABLE `push_receipts` (
	`id` varchar(191) NOT NULL,
	`token` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_receipts_id` PRIMARY KEY(`id`)
);
