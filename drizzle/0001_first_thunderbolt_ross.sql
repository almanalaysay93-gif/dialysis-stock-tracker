CREATE TABLE `batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`lotNumber` varchar(80) NOT NULL,
	`supplier` varchar(160),
	`quantityReceived` int NOT NULL,
	`quantityOnHand` int NOT NULL,
	`expiryDate` date NOT NULL,
	`isQuarantined` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumption_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionType` enum('HD','PD') NOT NULL,
	`itemId` int NOT NULL,
	`defaultQty` int NOT NULL,
	`label` varchar(120),
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `consumption_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` enum('dialyzer','bloodline','needles','saline','medications','disinfectants','PPE','PD supplies') NOT NULL,
	`unitOfMeasure` varchar(32) NOT NULL,
	`minStockLevel` int NOT NULL DEFAULT 0,
	`reorderLevel` int NOT NULL DEFAULT 0,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_consumables` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sessionId` bigint NOT NULL,
	`itemId` int NOT NULL,
	`batchId` int,
	`quantity` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_consumables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`batchId` int,
	`type` enum('stock-in','stock-out') NOT NULL,
	`reason` enum('issued','adjusted','written off','returned') NOT NULL,
	`quantity` int NOT NULL,
	`supplier` varchar(160),
	`lotNumber` varchar(80),
	`expiryDate` date,
	`notes` text,
	`performedBy` varchar(120),
	`performedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `treatment_sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`patientName` varchar(160) NOT NULL,
	`chair` varchar(16) NOT NULL,
	`shift` enum('morning','afternoon','evening') NOT NULL,
	`sessionType` enum('HD','PD') NOT NULL,
	`sessionDate` date NOT NULL,
	`status` enum('in-progress','completed') NOT NULL DEFAULT 'in-progress',
	`createdBy` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `treatment_sessions_id` PRIMARY KEY(`id`)
);
