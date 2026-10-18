CREATE TABLE `upload_hashes` (
	`hash` varchar(100) NOT NULL,
	`original` boolean NOT NULL DEFAULT false,
	`item` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `upload_hashes_hash_original_pk` PRIMARY KEY(`hash`,`original`)
);
