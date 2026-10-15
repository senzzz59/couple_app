CREATE TABLE `food_preferences` (
	`user_id` varchar(36) NOT NULL,
	`categories` json NOT NULL,
	CONSTRAINT `food_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `food_preferences` ADD CONSTRAINT `food_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;