CREATE TABLE `app_secrets` (
	`name` varchar(64) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `app_secrets_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `web_push_subscriptions` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(200) NOT NULL,
	`auth` varchar(100) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `web_push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `web_push_subscriptions` ADD CONSTRAINT `web_push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;