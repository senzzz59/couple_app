CREATE TABLE `shared_settings` (
	`key` varchar(64) NOT NULL,
	`value` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_settings_key` PRIMARY KEY(`key`)
);
