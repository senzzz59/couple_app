CREATE TABLE `push_tokens` (
	`token` varchar(191) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `push_tokens_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
ALTER TABLE `push_tokens` ADD CONSTRAINT `push_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;